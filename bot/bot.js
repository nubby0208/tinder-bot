const { logger, saveJson, parseProfileJson } = require("./utils/utils");
const GoLogin = require("gologin");
const puppeteer = require("puppeteer-core");


const {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  AgeRestrictedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  ProfileVerificationError,
  RanOutOfLikesError,
  StatusCheckComplete,
  ShadowBannedError,
  AlreadyFinishedError,
} = require("./utils/errors");

const { saveStatus, getAccountByJobId, markJobCompleted, incrementJobSwipes } = require("./utils/db");

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjdlMWZmNTRiODM0NDQzNzMzZDFmZjYiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MmVhYjFkNjVhNTkwNDllZTU1NzJjNGUifQ.qS6hMBAOc4ceOAWe0YBA1dqGcup5NCurzp1_DzPZSto";

class TinderBot {
  constructor(jobId, profileInfo, msTime, gl, browser) {
    this.jobId = jobId;
    this.profileInfo = profileInfo;
    this.msTime = msTime;
    this.gl = gl;
    this.browser = browser;
  }

  async sleep(millis) {
    return new Promise((resolve) => setTimeout(resolve, millis));
  }

  getRandom(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
  }

  async startLogin() {
    try {
      await this.checkTab();
      await this.openNewTab();
    } catch (error) {
      logger(error);
    }
  }

  async checkTab() {
    const pages = await this.browser.pages();
    if (pages.length > 1) {
      const vis_results = await Promise.all(
        pages.map(async (p, index) => {
          if (pages.length - 1 === index) {
            return;
          }
          await p.close();
        })
      );
    }
  }

  async openNewTab() {
    try {
      this.page = await this.browser.newPage();
      await this.page.setViewport({
        width: 1400,
        height: 994,
      });
      await this.page.setDefaultTimeout(0);
      await this.page.setDefaultNavigationTimeout(0);
      console.log(this.profileInfo.jobType, "&&&&");

      switch (this.profileInfo.jobType) {
        case "likes":
          await this.runLikesJob();
          break;
        case "recommended":
          await this.runRecommendedJob();
        case "status_check":
          break;
        default:
          throw new Error("unknown job type");
      }
    } catch (error) {
      await this.handleFailure(error);
    }
  }

  async runRecommendedJob() {
    await Promise.all([
      this.page.goto("https://tinder.com/app/recs", {
        waitUntil: "networkidle0",
        timeout: 0,
      }),
      this.page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 0,
      }),
    ]);
    logger("recs page loaded");
    //check if profile is gold
    await this.checkTinderProfileInfo();
    if (this.tinderProfileInfo.gold) {
      this.browser.close();
      return;
    }
    //check errors
    await this.checkAndHandleErrors();
    //click makeActiveTab
    await this.clickMakeActiveTab();
    //swipe on recs page
    let i = 0;
    let likeCounter = 0;
    let passCounter = 0;

    for await (const x of Array(this.swipes)) {
      await this.sleep(this.msTime);
      i = i + 1;
      await this.checkAndHandleErrors();
      const random = Math.random();

      if (random >= 1 - this.profileInfo.recSwipePercentage / 100) {
        likeCounter += 1;
        await this.clickLike();
      } else {
        passCounter += 1;
        await this.clickPass();
      }
      await incrementJobSwipes(this.jobId, this.profileInfo.runID);
      // await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 1000);
    }
    //
    await markJobCompleted({
      jobId: this.jobId,
      profileInfo: this.profileInfo,
      status: "finished running job",
      updateAccount: false,
    });
  }

  async clickPass() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => x.innerText == "NOPE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  async clickLike() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => x.innerText == "LIKE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  async runLikesJob() {
    await Promise.all([
      this.page.goto("https://tinder.com/app/likes-you", {
        waitUntil: "networkidle0",
        timeout: 0,
      }),
      this.page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 0,
      }),
    ]);

    logger("page loaded");

    //check errors
    await this.checkAndHandleErrors();
    //click makeActiveTab
    await this.clickMakeActiveTab();
    //check if profile is gold
    // await this.checkTinderProfileInfo();
    // console.log(this.tinderProfileInfo, "#######################################################");
    // if (this.tinderProfileInfo.id) {
    //   this.browser.close();
    //   return;
    // }

    await this.viewProfile();
    await this.like();

    // await this.sleep(3600 * 60);
    // await this.dislike();
    await this.sleep(2000);
    await markJobCompleted({
      jobId: this.jobId,
      profileInfo: this.profileInfo,
      status: "finished running job",
      updateAccount: false,
    });
  }

  async checkTinderProfileInfo() {
    console.log("start checkProfile");
    try {
      await this.page.on("response", async (response) => {
        if (response.url().startsWith("https://api.gotinder.com/v2/profile?")) {
          if (!this.savedTinderProfile) {
            let parsed = await parseProfileJson(await response.json());
            if (parsed) {
              this.tinderProfileInfo = parsed;
            }
            this.savedTinderProfile = true;
          }
        }
      });
    } catch (error) {
      console.log(error);
    }
  }

  async checkAndHandleErrors() {
    try {
      const url = await this.page.url();
      logger("checkAndHandleErrors: URL", url);
      if (url.includes("app/banned")) {
        throw new AccountBannedError();
      } else if (url.includes("verify/identity")) {
        throw new IdentityVerificationRequired();
      } else if (url.includes("verify/challenge")) {
        throw new CaptchaRequiredError();
      }

      await this.checkCaptchaRequired();

      if (await this.checkAgeRestricted()) {
        throw new AgeRestrictedError();
      }
      if (url == "https://tinder.com/") {
        throw new AccountLoggedOutError();
      }
      // await this.handleErrorPopup(); // move to check and handle errors
      await this.checkAccountUnderReview();

      console.log("CHECK UNDER REVIEW HERE");
      await this.checkProfileUnderReview();
      console.log("DONE: CHECK UNDER REVIEW HERE");

      // if (!url.startsWith(this.desiredURL)) {
      //   tlog(`navigated away from desired page to: ${this.desiredURL} -- redirecting.`);
      //   await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
      //   return;
      // }

      // if (await this.checkOutOfLikes()) {
      //   throw new OutOfLikesError();
      // }
    } catch (error) {
      console.log(error.trace);
    }
  }

  async checkCaptchaRequired() {
    return await this.page.evaluate(() => {
      let el = document.querySelector("p#home_children_body");
      if (el != null && el.innerText == " Please solve this puzzle so we know you are a real person") {
        throw new CaptchaRequiredError();
      }
    });
  }

  async checkProfileUnderReview() {
    const isUnderReview = await this.page.evaluate(async () => {
      let h3s = document.querySelectorAll("h3");
      console.log("check under review", h3s.length);
      let any = false;
      if (h3s != null) {
        h3s.forEach((e) => {
          if (e.innerText.toLowerCase() == "your account is under review") {
            any = true;
          }
        });
      }
      return any;
    });
    console.log("under review?", isUnderReview);
    if (isUnderReview) {
      throw new AccountUnderReviewError();
    }
  }

  async checkAccountUnderReview() {
    const element = await this.page.$('div[data-testid="dialog"] div[data-testid="subtitle-0"] span');
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (
        text ==
        "You’ve been reported by users too many times. We will be reviewing your account to determine what actions need to be made."
      ) {
        throw new AccountUnderReviewError();
      }
    }
  }

  async clickMakeActiveTab() {
    const page = this.page;
    try {
      console.log("Click makeActiveTab");
      const makeActiveTab = await page.$x('//span[contains(text(), "Make this my active tab")]');
      console.log("makeActiveTab", makeActiveTab);
      if (makeActiveTab) {
        await makeActiveTab.click();
        await page.waitForNavigation({ waitUntil: "networkidle0" });
      }
      console.log("check page's url", page.url());

      await this.checkAndHandleErrors();
      if (page.url().includes("/recs")) {
        // throw new AccountBannedError();
        console.log("something wrong");
        await this.browser.close();
        return;
      }
    } catch (error) {
      console.log(error);
    }
  }

  async dragAndDrop() {
    const likesYouCard = await this.page.$('[data-testid="likesYouCard"] div');
    let boundingBox;

    // TODO handle null case
    if (likesYouCard) {
      boundingBox = await likesYouCard.boundingBox();
      if (boundingBox) {
        await this.page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(1000, 50);
        // await this.page.mouse.move(1000, 19);
        await this.page.mouse.up();
      }
    }

    // wait for card to stop moving
    await this.page.waitForFunction(
      () => {
        let el = document.querySelectorAll('[data-testid="likesYouCard"]')[0];
        if (el) {
          return el.style.transform == "translate3d(0px, 0px, 0px) rotate(0deg) scale(1, 1)";
        }
      },
      { timeout: 0 }
    );
  }

  async like() {
    const page = this.page;
    try {
      //check errors
      await this.checkAndHandleErrors();
      for (let i = 0; i < 10; i++) {
        await this.sleep(this.msTime);
        if (i > 0 && i % 4 === 0) {
          logger("View profile");
          await this.viewProfile();
        }
        await this.dragAndDrop();
        await this.sleep(this.msTime);
        await incrementJobSwipes(this.jobId, this.profileInfo.runID);
        // const likeItem = await page.waitForXPath('//*[@id="q-1607362382"]/div[2]/div[' + this.getRandom(1, 3) + "]");
        // console.log("Swipe like", likeItem);

        // if (likeItem) {
        //   await this.sleep(this.msTime);
        //   await likeItem.click();
        //   try {
        //     const likeSwiper = await page.waitForXPath(
        //       '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[4]/button'
        //     );
        //     console.log(likeSwiper, "likeswipe");
        //     await this.sleep(this.msTime);
        //     await likeSwiper.click();
        //   } catch (error) {
        //     console.log(error, "error");
        //     process.exit();
        //   }
        // } else {
        //   console.log("error!!!");
        // }
      }
    } catch (error) {
      process.exit();
    }
  }

  async dislike() {
    const page = this.page;
    //check errors
    await this.checkAndHandleErrors();
    try {
      for (let i = 0; i < 10; i++) {
        await this.sleep(this.msTime);
        const dislikeItem = await page.waitForXPath(`//div[2]/div[${this.getRandom(1, 3)}]`);
        await dislikeItem.click();
        try {
          const dislikeSwiper = await page.waitForXPath(
            "//div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[2]/button"
          );
          await this.sleep(this.msTime);
          await dislikeSwiper.click();
        } catch (error) {
          console.log(error, "error");
          process.exit();
        }
      }
    } catch (error) {
      console.log(error);
      process.exit();
    }
  }

  async viewProfile() {
    const page = this.page;
    try {
      await this.sleep(this.msTime);
      console.log("start viewProfile");
      const profileItem = await this.page.$$('[data-testid="likesYouCard"] div');
      const selectedItem = await profileItem[3];
      console.log(selectedItem);
      if (selectedItem) {
        await this.sleep(2000);
        await selectedItem.click();
      }     

      for (let i = 0; i < 3; i++) {
        await this.sleep(this.msTime);
        const profile = await page.waitForXPath(
          `//div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[1]/div/div[1]/span/div/div[2]/button[${i + 1}]`
        );
        if (profile) {
          await profile.click();
          if (i === 2) {
            try {
              const likeSwiper = await page.waitForXPath(
                "//div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[4]/button"
              );
              await this.sleep(this.msTime);
              await likeSwiper.click();
            } catch (error) {
              console.log(error, "error");
              process.exit();
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
      process.exit();
    }
  }

  // create an object to store all the variables of the job or a class
  async handleFailure(e) {
    e.stack ? e.stack : (e.stack = "");
    let exitCode = 0;
    let screenshot = true;
    logger("handle job failure");
    if (this == null) {
      logger("error: no swipe job created");
      return 0;
    }

    try {
      if (e.stack.includes("Profile has been deleted")) {
        await markJobCompleted("profile_deleted");
      } else if (e.stack.includes("401 INVALID TOKEN OR PROFILE NOT FOUND")) {
        await markJobCompleted("profile_deleted");
      } else if (e instanceof AccountLoggedOutError) {
        await markJobCompleted("logged_out");
      } else if (e instanceof StatusCheckComplete) {
        await markJobCompleted("active");
      } else if (e instanceof ShadowBannedError) {
        await markJobCompleted("shadowbanned");
      } else if (e instanceof AlreadyFinishedError) {
        await markJobCompleted("finished (no swipes to run)", false);
      } else if (e instanceof AccountBannedError) {
        await markJobCompleted("banned");
        // await this.removeAccountLocation();
      } else if (e instanceof CaptchaRequiredError) {
        await markJobCompleted("captcha_required");
      } else if (e instanceof AgeRestrictedError) {
        await markJobCompleted("age_restricted");
      } else if (e instanceof IdentityVerificationRequired) {
        await markJobCompleted("identity_verification");
      } else if (e instanceof AccountUnderReviewError) {
        await markJobCompleted("under_review");
      } else if (e instanceof OutOfLikesError) {
        await markJobCompleted("out_of_likes");
      } else if (e instanceof RanOutOfLikesError) {
        // await markJobOutOfLikes();
      } else if (e instanceof ProfileVerificationError) {
        await markJobCompleted("verification_required");
      } else {
        // let retryStatusCheck = this.jobType == "status_check" && this.retries < 3;
        // let retryJob = this.jobType != "status_check" && this.retries < 3;
        // if (retryStatusCheck || retryJob) {
        //   logger(`Retrying. Retry Count Is ${this.retries}`);
        //   exitCode = 1;
        // } else {
        //   this.notifyError(`Job Failure id: ${this.jobID} type: ${this.jobType} username: ${this.username}`);
        // }
        // if (
        //   e instanceof ProxyError ||
        //   e.stack.includes("tunneling socket could not be established") ||
        //   e.stack.includes("net::ERR_FAILED") ||
        //   e.stack.includes("ERRCONNREFUSED")
        // ) {
        //   await this.markJobCompleted("proxy_error", false);
        //   return exitCode;
        // }
        // logger("ERROR: handle unexpected failure");
        // console.trace(e);
        // await this.markJobFailed(e);
      }

      // if (this.tp && this.tp.page) {
      //   await takeErrorScreenshot(this.tp.page, this.jobID);
      // }
    } catch (e) {
      logger("error: error in handle error", e);
    } finally {
      logger("EXITING-------------", exitCode);
      return exitCode;
    }
  }

  async checkAgeRestricted() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("age restricted");
      }
    }
  }
}

(async () => {
  const args = process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .reduce((args, [value, key]) => {
      args[value] = key;
      return args;
    }, {});

  const jobId = args.jobId;
  const msTime = args.msTime;
  logger(`${jobId}` + "   " + `${msTime}`);

  const profileInfo = await getAccountByJobId(jobId);
  const {
    tinderAccountID,
    recSwipePercentage,
    retries,
    disableImages,
    accountStatus,
    jobType,
    swipeDelay,
    profileID,
    apiToken,
    name,
    username,
    userID,
    delayVariance,
    runID,
  } = profileInfo;

  logger(`${profileID}`);

  const GL = new GoLogin({
    token: token,
    profile_id: profileID ?? "62d96a616c571b883455d369",
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);
    return { status: "failure" };
  });
  if (status !== "success") {
    console.log("Invalid status");
    return;
  }

  // connect browser
  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl?.toString(), ignoreHTTPSErrors: true });
  const bot = new TinderBot(jobId, profileInfo, msTime, GL, browser);
  bot.startLogin();
})();
