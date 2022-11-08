// controls the browser, tinder page, takes actions on the page
import playwright, { Page, Browser } from "playwright";
import fs from "fs";
import GoLogin from "gologin";
import path from "path";
import {
  tlog,
  terr,
  delay,
  saveJson,
  waitUntil,
  updateSwipeJobWithPending,
  updateMarkJobFailed,
  updateSwipeJobWithNoGold,
  updateTinderAccountWithNoGold,
  getRandom,
  saveCookie,
  loadCookie
} from "./utils";

import {
  AccountBannedError,
  AccountLoggedOutError,
  ProfileNoGoldError,
  AccountUnderReviewError,
  AgeRestrictedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  LimitOfLikesError,
  ProfileVerificationError,
  RanOutOfLikesError,
} from "./errors";
import { SwipeJob } from "./swipeJob";

const DEFAULT_TIMEOUT = 0;

export default interface TinderPage {
  page: Page;
  job: SwipeJob;
  GL: GoLogin;
  browser: Browser;
  savedProfile: any;
  browserContext: any;
}

export default class TinderPage {
  options: any;
  lastMatchHref: any;
  desiredURL!: string;
  constructor(job: SwipeJob, options: { profileID: string; apiToken: string }) {
    this.job = job;
    this.options = options;
  }

  async start() {
    let browserOptions = [];
    // if (this.options.disableImages) {
    browserOptions.push("--blink-settings=imagesEnabled=false");
    console.log(this.job.jobType);
    console.log(this.job.apiToken)
    // }
    // let apiToken =
    //   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjczMzJkMTc5ZTUwYTUyZTIwODI4ODQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MmZkN2M0YzYzODJiMTg4Njg0MTM0NjAifQ.phVgL2B0iy3vJde4ku7k0xcZTXXkvxNeJz-HnRIU-VY";
    this.GL = new GoLogin({
      autoUpdateBrowser: true,
      token: this.options.apiToken,
      // token: apiToken,
      profile_id: this.options.profileID,
      extra_params: browserOptions,
    });

    var url = "";
    const connectGL = async () => {
      try {
        const { status, wsUrl } = await this.GL.start();
        url = wsUrl.toString();
      } catch (e: any) {
        console.log(e)
        await this.stop();
        await delay(1000);
        await updateSwipeJobWithPending(this.job.jobID);
        process.exit(0);
      }
    };

    await connectGL();

    tlog("starting browser", url);
    this.browser = await playwright.chromium.connectOverCDP(url);
    let contexts = this.browser.contexts();
    this.browserContext = contexts[0];
    let context = contexts[0];
    let pages = await context.pages();
    const vis_results = await Promise.all(
      pages.map(async (p, index) => {
        if (pages.length - 1 === index) {
          tlog("don't close tinder.com page");
          this.page = p;
          return;
        }
        tlog("closing tinder.com page");
        p.close();
      })
    );

    // this.page = await context.newPage();
    // await this.page.route("**/*.{png,jpg,jpeg,gif,mov, mp4, avi,ogg,swf,webm}", (route) => route.abort());
    // this.page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
    // this.page.setDefaultTimeout(DEFAULT_TIMEOUT);
    // await this.page.route("**", (route) => route.continue());
    // await this.page.route("**/*.{png,jpg,jpeg}", (route) => route.abort());
    // this.page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
    // this.page.setDefaultTimeout(DEFAULT_TIMEOUT);
  }

  async checkGoldProfile(retry: number = 0) {
    try {
      // if (this.page.url() == "https://tinder.com/") {
      //   throw new AccountLoggedOutError();
      //   return;
      // }
      const [response] = await Promise.all([
        this.page.waitForResponse(
          (response) => {
            return response.url().includes("https://api.gotinder.com/v2/profile?") && response.status() === 200;
          },
          { timeout: 60 * 1000 * 1 }
        ),
      ]);
      retry = retry + 1;
      const resJson = await response.json();
      let parsed = await saveJson(this.job.jobID, JSON.stringify(resJson));
      console.log(parsed);
      const cookies = await this.page.context().cookies();
      await saveCookie(this.job.jobID, cookies);
      
      if (parsed) {
        this.job.profile = parsed;
        if (!parsed.gold) {
          // await this.page.close();
          // await this.browserContext.close();
          await updateSwipeJobWithNoGold(this.job.jobID);
          await updateTinderAccountWithNoGold(this.job.tinderAccountID);
        }
      }
      this.savedProfile = true;
    } catch (error: any) {
      console.log(this.page.url(), "&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
      tlog(`retry: ${retry}`);
      //@ts-ignore
      console.log(error, "^^^^^");
      //timeoutError if retry is 0
      //@ts-ignore
      if (retry === 0 && error.name === "TimeoutError") {
        await this.checkGoldProfile(1);
        return;
      }
      if (retry === 1 && !this.savedProfile) {
        if (error.name === "AccountLoggedOutError" || this.page.url() == "https://tinder.com/") {
          throw new AccountLoggedOutError();
          return;
        }
      }
      
      if (
        !this.savedProfile &&
        retry >= 1 &&
        (this.page.url().includes("/app/recs") || this.page.url().includes("/app/likes-you"))
      ) {
        this.checkAndHandleErrors()
        //check responding
        if (error.name === 'TimeoutError') {
          tlog("Responding gologin");
          await this.stop();
          await delay(1000);
          await updateSwipeJobWithPending(this.job.jobID);
          process.exit(0);
        }
        // await this.page.close();
        // await this.browserContext.close();
      }
    }
  }

  async stop() {
    if (this.browser) {
      try {
        tlog("found browser, closing");
        await this.page.close();
        await this.browserContext.close();
        await this.browser.close();
        tlog("done closing browser");
      } catch (e) {
        tlog("failed closing browser ");
      } finally {
        tlog("after closing browser ");
      }
    }

    try {
      tlog("stopping GL");
      await this.GL.stop();
      tlog("done stopping GL");
    } catch (e) {
      tlog("failed GL stop");
    } finally {
      tlog("after GL stop");
    }
  }

  async lastMatch(startIndex: number) {
    let match = await this.page.evaluate((startIndex) => {
      let lMatch = document.querySelector('a.matchListItem[href^="/app/messages"]') as HTMLAnchorElement | null;
      if (!lMatch) {
        return;
      }
      let lastHref = lMatch.href;
      lastHref = lastHref.replace("file://", "");
      lastHref = lastHref.replace("https://tinder.com", "");
      let selector = `a.matchListItem[href="${lastHref}"] span div div`;
      // console.log("looking for selector", selector)
      let node = document.querySelector(selector) as HTMLElement | null;
      let nameByHref;
      if (node) {
        nameByHref = node.innerText;
        // console.log("last match", nameByHref, lastHref)
        return [nameByHref, lastHref];
      }
    }, startIndex);

    if (match != null && this.lastMatchHref != match[1]) {
      this.lastMatchHref = match[1];
      return match;
    } else {
      // tlog("TP: no match found");
      return;
    }
  }

  getURL() {
    return this.page.url();
  }

  // checks
  async checkAndHandleErrors() {
    if (this.options.debug) {
      tlog("check and handle errors called");
    }
    const url = await this.page.url();
    if (!url.includes("https://tinder.com/")) {
      return;
    }
    tlog("checkAndHandleErrors: URL", url);
    if (url.includes("app/banned")) {
      throw new AccountBannedError();
    }
    if (url.includes("verify/identity")) {
      throw new IdentityVerificationRequired();
    }
    if (url.includes("verify/challenge")) {
      throw new CaptchaRequiredError();
    }

    await this.checkCaptchaRequired();

    // if (await this.checkActiveTabError()) {
    //   await tlog("handling active tab error");
    //   await this.handleActiveTabError();

    //   tlog("redo check and handle errors");
    //   await this.checkAndHandleErrors();

    //   return true;
    // }
    if (await this.checkAgeRestricted()) {
      throw new AgeRestrictedError();
    }

    if (url == "https://tinder.com/") {
      // throw new AccountLoggedOutError();
      const deserializedCookies = loadCookie(this.job.jobID);
      await this.page.context().addCookies(deserializedCookies)
      await this.navigateToLikesPage();
      return;
    }
    await this.handleErrorPopup(); // move to check and handle errors
    await this.checkAccountUnderReview();

    console.log("CHECK UNDER REVIEW HERE");
    await this.checkProfileUnderReview();
    console.log("DONE: CHECK UNDER REVIEW HERE");

    // if (!url.startsWith(this.desiredURL)) {
    //   tlog(`navigated away from desired page to: ${this.desiredURL} -- redirecting.`);
    //   await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
    //   return;
    // }

    const bootingUpStatus = await this.checkBoostingUp();
    if (bootingUpStatus === 1) {
      throw new OutOfLikesError();
    } else if (bootingUpStatus === 2) {
      tlog(`Doesn't find out the element in checkBootingUp`);
      if (url.includes("app/likes-you") || url.includes("app/matches")) {
        // await this.navigateToLikesPage();
        await this.stop();
        await delay(1000);
        await updateSwipeJobWithPending(this.job.jobID);
        process.exit(0);
      }
      return;
    }

    tlog("check out of likes");
    const isConnected = this.browser.isConnected();
    console.log("connecting.................", isConnected);
    if (await this.checkOutOfLikes()) {
      throw new OutOfLikesError();
    }
    if (await this.checkLimitOfLikes()) {
      throw new LimitOfLikesError();
    }
  }

  async checkOutOfLikes() {
    const isConnected = this.browser.isConnected();
    console.log("connecting..........checkoutoflikes.......", isConnected);
    let likesPageOutOfLikes = await this.page.evaluate(() => {
      let likesPage = document.querySelector('[data-testid="likesYouScroller"]');
      if (likesPage) {
        return likesPage.innerHTML.includes("your chances");
      }
    });
    return likesPageOutOfLikes;
  }

  async checkLimitOfLikes() {
    const isConnected = this.browser.isConnected();
    console.log("connecting..........checklimitoflikes.......", isConnected);
    try {
      await delay(500);
      const allH3Els = await this.page.$$('h3');
      for (var h3 of allH3Els) {
        const h3Text = await h3?.innerHTML();
        if (h3Text && h3Text.toLowerCase().includes('out of like')) {
          return true;
        }
      }
    } catch(e) {
      tlog(e)
      return false;
    }
    return false;
  }

  async checkBoostingUp() {
    try {
      tlog("checkBoostingUp");
      const isConnected = this.browser.isConnected();
      console.log("connecting.........checkboostingup........", isConnected);
      await delay(2000);
      const element = await this.page.waitForSelector("main", { timeout: 60 * 1000 * 1 });
      const searchText = await element.innerHTML();
      if (searchText.toString().includes("Increase")) {
        return 1; //likeOfError
      }
      return 0; //Normal
    } catch (error) {
      console.log(error);
      return 2; //timeoutError
    }
  }

  async checkProfileUnderReview() {
    const isUnderReview = await this.page.evaluate(async () => {
      let h3s = document.querySelectorAll<HTMLElement>("h3") as NodeList;
      console.log("check under review", h3s.length);
      let any = false;
      if (h3s != null) {
        h3s.forEach((e) => {
          if ((e as HTMLElement).innerText.toLowerCase() == "your account is under review") {
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

  async checkActiveTabError() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("opened the app in a new tab");
      }
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

  async checkCaptchaRequired() {
    return await this.page.evaluate(() => {
      let el = document.querySelector("p#home_children_body") as HTMLElement | null;
      if (el != null && el.innerText == " Please solve this puzzle so we know you are a real person") {
        throw new CaptchaRequiredError();
      }
    });
  }

  // TODO rec specific
  async navigateToRecsPage(retries: number = 0) {
    tlog("navigating to Recs");
    this.desiredURL = "https://tinder.com/app/recs";
    // this.page = await this.browserContext.newPage();
    // let pages = this.browserContext.pages();
    // const vis_results = await Promise.all(
    //   pages.map(async (p: any, index: number) => {
    //     if (pages.length - 1 === index) {
    //       tlog("don't close tinder.com page");
    //       this.page = p;
    //       return;
    //     }
    //     tlog("closing tinder.com page");
    //     p.close();
    //   })
    // );
    await Promise.all([
      this.page.goto(this.desiredURL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
      this.checkGoldProfile(),
      this.page.waitForNavigation({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
    ]);
    tlog("Done checking gold profile");
    await this.checkAndHandleErrors();
    tlog("wait for recsCardboard");
    try {
      await this.page.waitForSelector("div.recsCardboard__cards", { timeout: 60 * 1000 * 1 });
    } catch (e) {
      terr("error: navigate to recs page");
      await this.navigateToRecsPage(retries + 1);
      // if (retries < 2) {
      //   tlog("navigation retries", retries);
      //   await this.checkAndHandleErrors();
      //   await this.navigateToRecsPage(retries + 1);
      // } else {
      //   await this.navigateToRecsPage();
      // }
    }
    // finally {
    //   await this.checkAndHandleErrors();
    // }
  }

  async navigateToPassportPage() {
    tlog("navigating passport page");
    this.desiredURL = "https://tinder.com/app/settings/plus/passport";

    await Promise.all([
      this.page.goto(this.desiredURL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
      this.checkGoldProfile(),
      this.page.waitForNavigation({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
    ]);

    tlog("DONE - navigating to likes-you");

    let currentUrl = this.getURL();
    console.log(currentUrl, "**current url**");
    await this.checkAndHandleErrors();
    if (!currentUrl.includes("tinder.com/app/settings/plus/passport")) {
      await this.stop();
      await delay(1000);
      await updateSwipeJobWithPending(this.job.jobID);
      process.exit(0);
    }
  }

  // likes specific
  async navigateToLikesPage() {
    tlog("navigating to likes-you");
    this.desiredURL = "https://tinder.com/app/likes-you";

    await Promise.all([
      this.page.goto(this.desiredURL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
      this.checkGoldProfile(),
      this.page.waitForNavigation({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
    ]);

    tlog("DONE - navigating to likes-you");

    let currentUrl = this.getURL();
    console.log(currentUrl, "**current url**");
    await this.checkAndHandleErrors();
    if (!currentUrl.includes("tinder.com/app/likes-you")) {
      tlog(`tinder.com navigated away from desired page to: ${currentUrl} -- redirecting.`);
      const respondingOnGoLikePage = await this.goLikesYouPage();
      if (respondingOnGoLikePage) {
        tlog(`Doesn't find out the element in goLikesYouPage`);
        // await this.navigateToLikesPage();
        // return;
        await this.stop();
        await delay(1000);
        await updateSwipeJobWithPending(this.job.jobID);
        process.exit(0);
      }
      await delay(2000);
    }
  }
  // likes specific
  async queryChangeLocation(city: string) {
    // Change Location
    try {
      tlog("start location change");
      tlog("city", city);
      let locationInput = await this.page.waitForSelector("input[placeholder='Search a location']", {
        timeout: 1000 * 60 * 1,
      });
      let boundingBox;
      if (locationInput) {
        boundingBox = await locationInput.boundingBox();
        console.log(boundingBox, "got location input");
        if (boundingBox) {
          await this.page.mouse.click(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
          await delay(2000);
          await this.page.keyboard.type(city);
          await delay(3000);
          await this.page.mouse.click(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height + 20)
          await delay(6000);

          let addLocationBt = await this.page.waitForSelector("button[title='Add new location']", {
            timeout: 1000 * 60 * 5
          });

          boundingBox = await addLocationBt.boundingBox();

          if (boundingBox) {
            await this.page.mouse.click(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
          }
        }
      }
    } catch(error) {
      tlog('location change error', error);
      return -1;
    }
  }
  // likes specific
  async queryLikes() {
    try {
      tlog("start queryLikes");
      let likes = await this.page.waitForSelector("main .Expand nav span", { timeout: 1000 * 60 * 1 });
      let likesNumber = (await likes.innerText()).replace(/[^.\d]/g, "");
      tlog(`likes is ${likesNumber}`);
      const resultNum = likesNumber ? parseInt(likesNumber) : null;
      if (!resultNum || resultNum <= 1) {
        tlog("ran out of likes");
        throw new OutOfLikesError();
      } else {
        tlog("could not read liked by count");
      }
      return resultNum;
    } catch (error) {
      console.log(error);
      return -1;
    }
  }

  async goLikesYouPage() {
    try {
      const matchesTab = await this.page.waitForSelector("div[role=tablist] > div > button", {
        timeout: 1000 * 60 * 1,
      });
      await matchesTab.click();
      const likesItem = await this.page.waitForSelector('a.matchListItem[href^="/app/likes-you"]', {
        timeout: 1000 * 60 * 1,
      });
      await likesItem.click();
      return false;
    } catch (error) {
      console.log(error);
      tlog("happened error in goLikesYouPage func");
      return true;
    }
  }

  // recommended specific
  async waitForGamepadLikes() {
    try {
      tlog("wait for likes button");
      await this.page.waitForFunction(
        () => {
          let hiddenSpans = document.querySelectorAll("span.Hidden");
          let p0 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0];
          let p1;
          let p2;
          let p3;

          if (p0 != null) {
            p1 = p0.parentElement;
            if (p1 != null) {
              p2 = p1.parentElement;
              if (p2 != null) {
                p3 = p2.parentElement;
                if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
                  return true;
                }
              }
            }
          }

          return false;
        },
        { timeout: 30000 }
      );
    } catch (e) {
      // await this.checkGoldProfile();
      await this.checkAndHandleErrors();

      tlog("catch error waitForFunction likeButton");
      // if the button exists and is disabled throw appropriate error
      let gamepadDisabled = await this.page.evaluate(() => {
        let el = document.querySelectorAll(".recsCardboard__cardsContainer button")[13];
        let disabled;
        if (el) {
          disabled = el.getAttribute("aria-disabled");
        }
        return [!!el, disabled];
      });

      let outOfMatches = await this.page.evaluate(() => {
        let globalEl = document.querySelector('[aria-busy="true"] ~div div') as HTMLElement | null;
        let globalError;
        let runOutPotential;

        if (globalEl) {
          globalError = globalEl.innerText.includes("Go global and see people around the world.");
          runOutPotential = globalEl.innerText.includes("out of potential matches");
        }

        let unableToFindMatches = document.querySelector('[aria-busy="true"] ~div') as HTMLElement | null;
        let unableToMatchError;
        if (unableToFindMatches) {
          unableToMatchError = unableToFindMatches.innerText.includes("find any potential matches");
        }

        let allHtml = document.querySelector(".recsCardboard__cards");
        let allHtmlErr;
        if (allHtml) {
          allHtmlErr =
            allHtml.innerHTML.includes("run out of potential matches") ||
            allHtml.innerHTML.includes("unable to find any potential matches") ||
            allHtml.innerHTML.includes("Go global and see people around the world");
        }

        return globalError || runOutPotential || unableToMatchError || allHtmlErr;
      });

      if (gamepadDisabled[1]) {
        tlog("throw specific error here");
        throw new OutOfLikesError();
      } else if (outOfMatches) {
        tlog("error: Go global and see people around the world.");
        throw new OutOfLikesError();
      } else {
        tlog("throw unhandled timeout error");
        throw e;
      }
    }
  }

  async clickPass() {
    try {
      await this.page.waitForFunction(
        () => {
          let hiddenSpans = document.querySelectorAll("span.Hidden");
          let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "NOPE")[0].parentElement;
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
        },
        { timeout: 60 * 1000 * 1 }
      );
    } catch (error) {
      terr("clickPass error");
      await this.navigateToRecsPage();
    }
  }

  async clickLike() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0].parentElement;
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

  // actions
  async handleErrorPopup() {
    const selector = '[data-testid="onboarding__errorTitle"]';
    if ((await this.page.$(selector)) !== null) {
      tlog("detected errorTitle - pressing escape");
      await this.page.keyboard.press("Escape");
    }
  }

  async handleActiveTabError() {
    await this.page.evaluate(() => {
      let el = document.querySelector('button[data-testid="reload"]') as HTMLElement | null;
      if (el != null) {
        el.click();
      }
    });
    await delay(10000);
    // await this.page.waitForNavigation()
  }

  async dragAndDrop() {
    tlog("start drag and drop");
    await this.checkAndHandleErrors();
    tlog("Done checking error on dragAndDrop", this.page.url());
    if (this.page.url().includes("/app/matches")) {
      return false;
    }
    try {
      // const likesYouCard = await this.page.waitForSelector('[data-testid="likesYouCard"] div', {
      //   timeout: 1000 * 60 * 1,
      // });
      const likesYouCard = await this.page.waitForSelector('[data-testid="likesYouCard"] div', {
        timeout: 1000 * 60 * 1,
      });
      const cards = await this.page.$$(`[data-testid="likesYouCard"]`);
      var limitSwipe = 6;
      if (cards.length < limitSwipe)
        limitSwipe = cards.length;
      const likesYouCard1 = this.page.locator(`[data-testid="likesYouCard"] >> nth=${getRandom(0, limitSwipe - 1)}`);

      let boundingBox;
      // TODO handle null case
      if (likesYouCard1) {
        boundingBox = await likesYouCard1.boundingBox();
        if (boundingBox) {
          await this.page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
          await this.page.mouse.down();
          await this.page.mouse.move(1924, 19);
          await this.page.mouse.up();
        }
      }
      await delay(800);
      return false;
    } catch (error) {
      console.log(error);
      return true;
    }
  }
}
