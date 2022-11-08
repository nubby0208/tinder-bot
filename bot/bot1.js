const puppeteer = require("puppeteer-core");
const GoLogin = require("gologin");

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjdlMWZmNTRiODM0NDQzNzMzZDFmZjYiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MmVhYjFkNjVhNTkwNDllZTU1NzJjNGUifQ.qS6hMBAOc4ceOAWe0YBA1dqGcup5NCurzp1_DzPZSto";

const sleep = async (millis) => {
  return new Promise((resolve) => setTimeout(resolve, millis));
};

const getRandom = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
};

const checkCaptchaRequired = async () => {
  return await page.evaluate(() => {
    let el = document.querySelector("p#home_children_body");
    if (el != null && el.innerText == " Please solve this puzzle so we know you are a real person") {
      console.log("Tinder Presenting Captcha");
    }
  });
};

const checkAndHandleErrors = async (url) => {
  console.log("checkAndHandleErrors: URL", url);
  if (url.includes("app/banned")) {
    console.log("Account Banned");
  } else if (url.includes("verify/identity")) {
    console.log("IdentityVerificationRequired");
  } else if (url.includes("verify/challenge")) {
    console.log("Tinder Presenting Captcha");
  } else if (url.includes("/recs")) {
    console.log("Wrong url");
  }

  // await checkCaptchaRequired();
  // if (await this.checkActiveTabError()) {
  //   await tlog("handling active tab error");
  //   await this.handleActiveTabError();

  //   tlog("redo check and handle errors");
  //   await this.checkAndHandleErrors();

  //   return true;
  // }
  // if (await this.checkAgeRestricted()) {
  //   throw new AgeRestrictedError();
  // }
  // if (url == "https://tinder.com/") {
  //   throw new AccountLoggedOutError();
  // }
  // await this.handleErrorPopup(); // move to check and handle errors
  // await this.checkAccountUnderReview();

  // console.log("CHECK UNDER REVIEW HERE");
  // await this.checkProfileUnderReview();
  // console.log("DONE: CHECK UNDER REVIEW HERE");

  // if (!url.startsWith(this.desiredURL)) {
  //   tlog(`navigated away from desired page to: ${this.desiredURL} -- redirecting.`);
  //   await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
  //   return;
  // }

  // if (await this.checkOutOfLikes()) {
  //   throw new OutOfLikesError();
  // }
};

(async () => {
  const args = process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .reduce((args, [value, key]) => {
      args[value] = key;
      return args;
    }, {});

  const profileId = args.profileId.toString();
  const likeCount = args.like;
  const dislikeCount = args.dislike;

  console.log(profileId, likeCount, dislikeCount);

  if (!profileId && (likeCount || dislikeCount)) {
    console.log("Something went wrong!");
    return;
  }

  const GL = new GoLogin({
    token: token,
    profile_id: profileId ?? "62d96a616c571b883455d369",
  });
  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);
    return { status: "failure" };
  });
  if (status !== "success") {
    console.log("Invalid status");
    return;
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const pages = await browser.pages();

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

  const page = await browser.newPage();
  await page.setViewport({
    width: 1400,
    height: 994,
  });
  await page.setDefaultTimeout(0);
  await page.setDefaultNavigationTimeout(0);

  await Promise.all([
    page.goto("https://tinder.com/app/likes-you", {
      waitUntil: "networkidle0",
      // Remove the timeout
      timeout: 0,
    }),
    page.waitForNavigation({
      waitUntil: "networkidle0",
      // Remove the timeout
      timeout: 0,
    }),
  ]);

  console.log("page loaded");

  // Start Checking error
  const url = await page.url();
  await checkAndHandleErrors(url);
  // End Checking error

  try {
    await page.waitForXPath('//*[@id="q554704800"]/div/div/button');
    const [makeActiveTab] = await page.$x('//*[@id="q554704800"]/div/div/button');
    console.log(makeActiveTab, "Click makeActiveTab");
    if (makeActiveTab) {
      await makeActiveTab.click();
      await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 0 });
    }
  } catch (error) {
    console.log(error);
  }

  console.log("page reload", page.url());
  // await sleep(1000 * getRandom(1, 7));
  if (likeCount > 0) {
    try {
      for (let i = 0; i < likeCount; i++) {
        await sleep(1000 * getRandom(1, 7));
        console.log(i);
        const retItem = await page.waitForXPath('//*[@id="q-1607362382"]/div[2]/div[1]');
        console.log(retItem);
        if (retItem) {
          // const [matchPanel] = await page.$x(`//*[@id="q-1607362382"]/div[2]/div[1]`);
          await sleep(1000 * getRandom(1, 7));
          await retItem.click();
          try {
            await page.waitForXPath(
              '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[4]/button'
            );
            const [likeSwipe] = await page.$x(
              '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[4]/button'
            );
            console.log(likeSwipe, "likeswipe");
            await sleep(1000 * getRandom(1, 7));
            await likeSwipe.click();
          } catch (error) {
            console.log(error, "error");
            process.exit();
          }
        } else {
          console.log("error!!!");
        }
      }
    } catch (error) {
      process.exit();
    }
  }

  await sleep(1000 * getRandom(1, 7));
  if (dislikeCount > 0) {
    try {
      for (let i = 0; i < dislikeCount; i++) {
        await sleep(1000 * getRandom(1, 7));
        await page.waitForXPath(`//*[@id="q-1607362382"]/div[2]/div[1]`);
        const [matchPanel] = await page.$x(`//*[@id="q-1607362382"]/div[2]/div[1]`);
        await matchPanel.click();
        try {
          await page.waitForXPath(
            '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[2]/button'
          );
          const [dislikeSwipe] = await page.$x(
            '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[2]/button'
          );
          await sleep(1000 * getRandom(1, 7));
          await dislikeSwipe.click();
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
  // if (likeCount > 0) {
  //   for (let i = 0; i <= likeCount; i++) {
  //     await sleep(2000);
  //     console.log("like", i);
  //     await likeSwipe.click();
  //   }
  // }

  //dislike
  // console.log("sleep 3 seconds");
  // await sleep(3000);
  // try {
  //   await page.waitForXPath(
  //     '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[1]/div[1]/div/div[5]/div/div[2]/button'
  //   );
  //   console.log("loaded buttons for dislike!");
  // } catch (error) {
  //   console.log(error);
  //   process.exit();
  // }

  // const [dislikeSwipe] = await page.$x(
  //   '//*[@id="q554704800"]/div/div[1]/div/main/div[1]/div/div/div[1]/div[1]/div/div[5]/div/div[2]/button'
  // );

  // if (dislikeCount > 0) {
  //   for (let i = 0; i <= dislikeCount; i++) {
  //     await sleep(2000);
  //     await dislikeSwipe.click();
  //     console.log("dislike", i);
  //   }
  // }

  // await sleep(3000);
  // await browser.close();
  // await GL.stop();
})();
