import dotenv from "dotenv";
dotenv.config();
import path from "path";
import {
  tlog,
  delay,
  createLogDir,
  sendUserTelegramMessage,
  rnd,
  sendTelegramMessage,
  waitUntil,
  delayWithFunction,
  takeErrorScreenshot,
  getDBClient,
  sleep,
  getRandom
} from "./utils";
import TinderPage from "./tinderPage";

import {
  AccountBannedError,
  AccountLoggedOutError,
  ProfileNoGoldError,
  AccountUnderReviewError,
  AgeRestrictedError,
  AlreadyFinishedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  LimitOfLikesError,
  ProfileVerificationError,
  ProxyError,
  RanOutOfLikesError,
  ShadowBannedError,
  StatusCheckComplete,
} from "./errors";
import { Client } from "pg";

const locationData = require('./constants/locations.json')

interface Profile {
  gold: any;
}

export class SwipeJob {
  jobID: number;
  options: any;
  swipesSinceLastMatch: number;
  shadowBanSwipeCount: number;
  executionContextDestroyedCounter: number;
  profile!: Profile;
  tp!: TinderPage;
  client!: Client;
  tinderAccountID!: number;
  recSwipePercentage!: number;
  retries!: number;
  accountStatus!: string;
  status!: string;
  jobType!: string;
  swipeDelay!: number;
  profileID!: string;
  apiToken!: string;
  name!: string;
  username!: string;
  userID!: number;
  swipes!: number;
  delayVariance!: number;
  runID!: number;
  currentSwipes!: number;

  constructor(jobID: number, options: any) {
    this.jobID = jobID;
    this.options = options;
    this.options.verbose = true;
    this.swipesSinceLastMatch = 0;
    this.shadowBanSwipeCount = 70;
    this.executionContextDestroyedCounter = 0;
  }

  setTinderPage(tinderPage: TinderPage) {
    this.tp = tinderPage;
  }

  async runQuery(query: string, values: any[]) {
    if (this.options.sqlDebug) {
      tlog(query);
    }
    return await this.client.query(query, values);
  }

  async Create() {
    let jobID: number;
    // try {
    this.client = await getDBClient();

    createLogDir(this.jobID);
    let query = `
        select
          tinder_accounts.id tinder_acc_id,
          retries,
          job_type,
          swipes,
          disable_images,
          tinder_accounts.status as account_status,
          gologin_profile_id,
          gologin_api_token,
          gologin_profile_name,
          delay_variance,
          target - swipes as target,
          recommended_percentage,
          name as username,
          delay as swipe_delay,
          users.id as user_id
        from tinder_accounts
        JOIN swipe_jobs ON swipe_jobs.tinder_account_id = tinder_accounts.id
        JOIN users on users.id = tinder_accounts.user_id
        where swipe_jobs.id = ${this.jobID}`;

    let res = await this.runQuery(query, []);

    if (!res.rows[0]) {
      throw new Error("Job not found");
    }

    this.tinderAccountID = res.rows[0].tinder_acc_id;
    this.recSwipePercentage = res.rows[0].recommended_percentage;
    this.retries = res.rows[0].retries;
    let disableImages = res.rows[0].disable_images;
    this.accountStatus = res.rows[0].account_status;
    this.jobType = res.rows[0].job_type;
    this.swipeDelay = res.rows[0].swipe_delay;
    this.profileID = res.rows[0].gologin_profile_id;
    this.apiToken = res.rows[0].gologin_api_token;
    this.name = res.rows[0].gologin_profile_name;
    this.username = res.rows[0].username;
    this.userID = res.rows[0].user_id;
    this.swipes = res.rows[0].target;
    this.currentSwipes = res.rows[0].swipes;


    if (this.jobType == "status_check") {
      this.swipes = this.shadowBanSwipeCount + 1;
    }

    if (this.jobType == "limit_of_likes") {
      this.swipes = 100000000;
    }

    this.delayVariance = parseFloat(res.rows[0].delay_variance);

    // TODO test me
    if (this.swipes < 1 && this.jobType != "status_check" && this.jobType != 'location_change') {
      throw new AlreadyFinishedError();
    }

    if (this.options.verbose) {
      tlog("START JOB ------------------");
      tlog(
        "\nType:",
        this.jobType,
        "\nid:",
        this.jobID,
        "\nprofile:",
        this.profileID,
        "\nswipes:",
        this.swipes,
        "\ncurrent_swipes:",
        this.currentSwipes
      );
    }

    query = `
      INSERT INTO runs(swipe_job_id, created_at, updated_at)
      VALUES ( $1, timezone('utc', now()), timezone('utc', now()) ) RETURNING id`;
    let values = [this.jobID];
    res = await this.runQuery(query, values);
    this.runID = res.rows[0].id;
    // tlog("runID:", this.runID)

    query = `
      update swipe_jobs
      set
        started_at=timezone('utc', now()),
        status='running',
        account_job_status_result=NULL,
        retries=retries+1,
        failed_at=null,
        failed_reason=null
      where id = $1`;
    await this.runQuery(query, [this.jobID]);

    // } catch (e: any) {
    //   await this.handleFailure(e)
    //   throw e
    // }
    return this;
  }

  async updateSwipeJobToPending() {
    await this.tp.stop();
    await delay(1000);
    const query = `
      SELECT status
      FROM swipe_jobs
      where id = $1`;
    const res = await this.runQuery(query, [this.jobID]);
    const status = res.rows[0].status;
    if (status !== "cancelled") {
      const query = `
        update swipe_jobs
        set
          started_at=timezone('utc', now()),
          status='pending',
          account_job_status_result=NULL,
          retries=retries+1,
          failed_at=null,
          failed_reason=null
        where id = $1`;
      await this.runQuery(query, [this.jobID]);
    }
  }

  async checkAwSnapError() {
    const query = `
    select * swipe_jobs where id = $1`;
    let res = await this.runQuery(query, [this.jobID]);

    if (!res.rows[0]) {
      return false;
    }

    const swipesInDB = res.rows[0].swipes;
    if (swipesInDB >= this.currentSwipes) {
    }
    return true;
  }

  async Run() {
    let exitCode = 0;
    try {
      if (this.options.verbose) {
        tlog(
          "\n",
          "type:",
          this.jobType,
          "\n",
          "id:",
          this.jobID,
          "\n",
          "name:",
          this.name,
          "\n",
          "profileID:",
          this.profileID
        );
      }

      switch (this.jobType) {
        case "likes":
          await this.runLikesJob();
          break;
        case "recommended":
          await this.runRecommendedJob();
          break;
        case "status_check":
          await this.runStatusCheckJob();
          break;
        case "location_change":
          await this.runLocationChangeJob();
          break;
        case "limit_of_likes":
          await this.runLimitOfLikesJob();
          break;
        default:
          throw new Error("unknown job type");
      }
      await this.markJobCompleted("finished running job", false);
    } catch (e: any) {
      // if (this.options.verbose) { tlog("SwipeJob: failed", e) }
      exitCode = await this.handleFailure(e);
    } finally {
      return exitCode;
    }
  }

  async incrementJobSwipes() {
    this.swipesSinceLastMatch += 1;
    await this.runQuery(
      `
      update swipe_jobs
      set swipes = swipes + 1, swiped_at = timezone('utc', now())
      where id = $1
    `,
      [this.jobID]
    );
    await this.runQuery(
      `
      update runs
      set swipes = swipes + 1
      where id = $1
    `,
      [this.runID]
    );
    // if more than 50 swipes have occured since last match, throw shadowbanned error
    tlog("swipes since last match:", this.swipesSinceLastMatch);

    if (this.swipesSinceLastMatch >= this.shadowBanSwipeCount && this.jobType !== 'limit_of_likes') {
      tlog(`more than ${this.shadowBanSwipeCount} swipes since last match. account considered shadowbanned`);
      throw new ShadowBannedError();
    }
  }

  async insertMatch() {
    let startIndex = this.profile?.gold ? 2 : 1;
    let lastMatch = await this.tp.lastMatch(startIndex);
    if (!lastMatch) {
      return;
    }
    tlog("new match", lastMatch);
    let nameArr = lastMatch[0].split(" ");
    let name = nameArr[nameArr.length - 1].replace(/!/, "");
    let useridArr = lastMatch[1].split("/");
    let userid = useridArr[useridArr.length - 1];

    let query = `
      INSERT INTO matches (tinder_account_id, tinder_user_id, name, created_at, updated_at)
      VALUES ($1, $2, $3, timezone('utc', now()), timezone('utc', now())) ON CONFLICT DO NOTHING`;
    let values = [this.tinderAccountID, userid, name];
    let res = await this.runQuery(query, values);

    if (res.rowCount == 0) {
      tlog("already logged this match before. Skipping...");
      return;
    }

    this.swipesSinceLastMatch = 0;

    if (this.accountStatus != "active") {
      await this.updateAccountStatus("active");
      this.accountStatus = "active";
    }

    query = `
      UPDATE tinder_accounts
      SET last_matched_at=timezone('utc', now()),
      updated_at=timezone('utc', now())
      WHERE id = $1`;
    await this.runQuery(query, [this.tinderAccountID]);
    if (this.jobType == "status_check") {
      throw new StatusCheckComplete();
    }
  }

  async updateLikeCount(likes: number) {
    tlog("account has", likes, "liked by count");
    const query = `
      UPDATE tinder_accounts
        SET liked_by_count=$1,
        liked_by_count_updated_at=timezone('utc', now()),
        updated_at=timezone('utc', now())
      where id = $2`;
    await this.runQuery(query, [likes, this.tinderAccountID]);
  }

  async updateAccountStatus(status: string) {
    if (status == "proxy_error") {
      let query = `
        UPDATE tinder_accounts
          SET proxy_active=false,
          updated_at=timezone('utc', now()),
          status_updated_at=timezone('utc', now())
          where id = $1`;
      await this.runQuery(query, [this.tinderAccountID]);
    } else {
      let query = `
        UPDATE tinder_accounts
          SET status='${status}',
          updated_at=timezone('utc', now()),
          status_updated_at=timezone('utc', now())
          where id = $1`;
      await this.runQuery(query, [this.tinderAccountID]);

      query = `
        INSERT INTO account_status_updates (retry, before_status, status, tinder_account_id, created_at, updated_at, swipe_job_id)
        VALUES ($1,$2,$3,$4,timezone('utc', now()),timezone('utc', now()),$5)`;
      await this.runQuery(query, [this.retries, this.accountStatus, status, this.tinderAccountID, this.jobID]);

      // handle account status notification
      if (this.accountStatus != status && status == "captcha_required") {
        try {
          await sendUserTelegramMessage(
            this.userID,
            `captcha https://visadoo.com/tinder_account/${this.tinderAccountID}`
          );
        } catch (e) {
          tlog("error sending user telegram message");
          console.log(e);
        }
      }
    }
  }

  async removeAccountLocation() {
    const query = `
      UPDATE tinder_accounts
        SET location_id=NULL,
        updated_at=timezone('utc', now())
      where id = $1`;
    await this.runQuery(query, [this.tinderAccountID]);
  }

  async getSwipeDelay() {
    let min = 1.0 - this.delayVariance / 100;
    let max = 1.0 + this.delayVariance / 100;
    let x = rnd(this.swipeDelay * min, this.swipeDelay * max);
    return x;
  }

  async markJobCancelled() {
    const query = `
      UPDATE swipe_jobs
        SET status='cancelled',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query, [this.jobID]);
    const query2 = `
      UPDATE runs
        SET status='cancelled',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query2, [this.runID]);
    tlog("marked job cancelled");
  }

  async markJobRunning() {
    const query = `
      update swipe_jobs
      set
        started_at=timezone('utc', now()),
        status='running',
        account_job_status_result=NULL,        
        failed_at=null,
        failed_reason=null
      where id = $1`;
    await this.runQuery(query, [this.jobID]);
    tlog("marked job running");
  }

  async queryDBStatus() {
    const query = `
      SELECT status
      FROM swipe_jobs
      where id = $1`;
    return await this.runQuery(query, [this.jobID]);
  }

  async checkCancelledStatus() {
    const query = `
      SELECT status
      FROM swipe_jobs
      where id = $1`;
    const res = await this.runQuery(query, [this.jobID]);
    return res.rows[0].status;
  }

  async markJobOutOfLikes() {
    const query = `
      UPDATE swipe_jobs
        SET status='ran_out_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query, [this.jobID]);
    const query2 = `
      UPDATE runs
        SET status='ran_out_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query2, [this.runID]);
    tlog("marked job", this.jobID, "ran out of likes");
  }

  async markJobLimitOfLikes() {
    const query = `
      UPDATE swipe_jobs
        SET status='ran_limit_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query, [this.jobID]);
    const query2 = `
      UPDATE runs
        SET status='ran_limit_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query2, [this.runID]);
    tlog("marked job", this.jobID, "ran limit of likes");
  }

  async markJobFailedWithNoGoldProfile(e: Error) {
    let failedReason = "Profile is not gold";
    tlog(failedReason);
    const query = `
      UPDATE swipe_jobs
        SET status='failed',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query, [this.jobID]);

    const query2 = `
      UPDATE runs
        SET status='failed',
        failed_at=timezone('utc', now()),
        failed_reason=$1
        where id = $2`;
    await this.runQuery(query2, [failedReason, this.runID]);
    tlog("marked job", this.jobID, "failed");
    this.status = "failed";
  }

  async markJobFailed(e: Error) {
    let failedReason = e.stack ? e.stack.toString() : "";
    tlog(failedReason);
    const query = `
      UPDATE swipe_jobs
        SET status='failed',
        failed_at=timezone('utc', now())
        where id = $1`;
    await this.runQuery(query, [this.jobID]);

    const query2 = `
      UPDATE runs
        SET status='failed',
        failed_at=timezone('utc', now()),
        failed_reason=$1
        where id = $2`;
    await this.runQuery(query2, [failedReason, this.runID]);
    tlog("marked job", this.jobID, "failed");
    this.status = "failed";
  }

  async markJobCompleted(status: string, updateAccount = true) {
    let query;
    let query2;

    if (updateAccount == null) {
      updateAccount = true;
    }
    await tlog("\nmarking complete\nstatus: ", status, "\nupdateAccount: ", updateAccount);

    if (updateAccount) {
      await this.updateAccountStatus(status);
      if (status === "limit_of_likes") {
        query = `
          update swipe_jobs
          set status='completed',
          scheduled_at=timezone('utc', now() + '12 hours'),
          job_type='limit_of_likes',
          completed_at=timezone('utc', now()),
          where id = ${this.jobID}`;            
      } else {
        query = `
          update swipe_jobs
          set status='completed',
          completed_at=timezone('utc', now()),
          account_job_status_result='${status ?? "at"}'
          where id = ${this.jobID}`;
      }

      query2 = `
        update runs
        set status='completed',
        completed_at=timezone('utc', now()),
        result='${status}'
        where id = ${this.runID}`;
    } else {
      query = `
        update swipe_jobs
        set status='completed',
        completed_at=timezone('utc', now()),
        failed_reason='${status ?? "af"}'
        where id = ${this.jobID}`;
      query2 = `
        update runs
        set status='completed',
        completed_at=timezone('utc', now()),
        failed_reason='${status}'
        where id = ${this.runID}`;
    }

    await this.runQuery(query, []);
    await this.runQuery(query2, []);

    // TODO test me
    if (this.jobType == "status_check") {
      tlog("mark status check complete");
      await this.markStatusCheckCompleted();
    }

    this.accountStatus = status;
    this.status = "completed";
  }

  async markStatusCheckCompleted() {
    const query = `
      UPDATE tinder_accounts
        SET status_checked_at=timezone('utc', now())
      where id = $1`;
    await this.runQuery(query, [this.tinderAccountID]);
  }

  // create an object to store all the variables of the job or a class
  async handleFailure(e: Error) {
    e.stack ? e.stack : (e.stack = "");
    let exitCode = 0;
    let screenshot = true;
    tlog("handle job failure");
    if (this.options.debug) {
      console.log("logerror", e);
    }
    if (this.options.waitOnFailure) {
      await delay(600000);
    }

    if (this == null) {
      tlog("error: no swipe job created");
      // process.exit(0);
      return 0;
    }

    try {
      if (e.stack.includes("Profile has been deleted")) {
        await this.markJobCompleted("profile_deleted");
      } else if (e.stack.includes("401 INVALID TOKEN OR PROFILE NOT FOUND")) {
        await this.markJobCompleted("profile_deleted");
      } else if (e instanceof ProfileNoGoldError) {
        await this.markJobFailedWithNoGoldProfile(e);
        await this.tp.stop();
        await await(1000);
        process.exit(0);
      } else if (e instanceof AccountLoggedOutError) {
        await this.markJobCompleted("logged_out");
      } else if (e instanceof StatusCheckComplete) {
        await this.markJobCompleted("active");
      } else if (e instanceof ShadowBannedError) {
        await this.markJobCompleted("shadowbanned");
      } else if (e instanceof AlreadyFinishedError) {
        await this.markJobCompleted("finished (no swipes to run)", false);
      } else if (e instanceof AccountBannedError) {
        await this.markJobCompleted("banned");
        await this.removeAccountLocation();
      } else if (e instanceof CaptchaRequiredError) {
        await this.markJobCompleted("captcha_required");
      } else if (e instanceof AgeRestrictedError) {
        await this.markJobCompleted("age_restricted");
      } else if (e instanceof IdentityVerificationRequired) {
        await this.markJobCompleted("identity_verification");
      } else if (e instanceof AccountUnderReviewError) {
        await this.markJobCompleted("under_review");
      } else if (e instanceof LimitOfLikesError) {
        await this.markJobCompleted("limit_of_likes");
      } else if (e instanceof OutOfLikesError) {
        await this.markJobCompleted("out_of_likes");
      } else if (e instanceof RanOutOfLikesError) {
        await this.markJobOutOfLikes();
      } else if (e instanceof ProfileVerificationError) {
        await this.markJobCompleted("verification_required");
      } else {
        let retryStatusCheck = this.jobType == "status_check" && this.retries < 3;
        let retryJob = this.jobType != "status_check" && this.retries < 3;

        if (retryStatusCheck || retryJob) {
          tlog(`Retrying. Retry Count Is ${this.retries}`);
          exitCode = 1;
        } else {
          this.notifyError(`Job Failure id: ${this.jobID} type: ${this.jobType} username: ${this.username}`);
        }

        if (
          e instanceof ProxyError ||
          e.stack.includes("tunneling socket could not be established") ||
          e.stack.includes("net::ERR_FAILED") ||
          e.stack.includes("ERRCONNREFUSED")
        ) {
          await this.markJobCompleted("proxy_error", false);
          // return exitCode;
        }

        tlog("ERROR: handle unexpected failure");
        console.trace(e);
        // await delay(2000);
        // const bConn = await this.tp.browser.isConnected();
        // console.log(bConn, "^^^^^^^^^^^^^^^^^handleFailure^^^^^^^^^^^^");
        await this.tp.stop();
        await delay(1000);
        await this.updateSwipeJobToPending();
        process.exit(0);
        // if (!this.tp.browser.isConnected) {
        //   await this.markJobFailed(e);
        // } else {
        //   await this.updateSwipeJobToPending();
        //   if (this.tp && this.tp.page) {
        //     await takeErrorScreenshot(this.tp.page, this.jobID);
        //   }
        //   process.exit(0);
        // }
      }

      if (this.tp && this.tp.page) {
        await takeErrorScreenshot(this.tp.page, this.jobID);
      }
    } catch (e) {
      tlog("error: error in handle error", e);
    } finally {
      tlog("EXITING-------------", exitCode);
      return exitCode;
    }
  }

  async notifyError(message: string) {
    await sendTelegramMessage(message);
  }

  // move to tinderlikes
  // params:
  // - number of swipes
  // - swipe callback
  // - delay checker
  async runLikesJob() {
    await this.tp.navigateToLikesPage();
    //setInterval
    let startSwipesCount = 0;
    let endSwipesCount = 0;
    let isAwSnap = false;
    const intervalId = setInterval(async () => {
      console.log("^^^^^^^^^^^^", startSwipesCount, endSwipesCount);
      if (startSwipesCount === endSwipesCount) {
        clearInterval(intervalId);
        await this.tp.stop();
        await delay(1000);
        await this.updateSwipeJobToPending();
        process.exit(0);
      } else {
        startSwipesCount = endSwipesCount;
      }
    }, 1000 * 60 * 3);

    if (isAwSnap) {
    }
    for (let i = 1; i <= this.swipes; i++) {
      tlog(`count the swipe ${i}..........................................`);
      const currentPageUrl = this.tp.getURL();
      if (i % 100 === 0) {
        await delay(2000);
        if (this.tp.page !== undefined) {
          await this.tp.navigateToLikesPage();
        }
      }

      if (i % 10 === 0) {
        const likeCount = await this.tp.queryLikes();
        if (likeCount && likeCount === -1) {
          tlog(`Doesn't find out the element in queryLikes`);
          // await this.tp.navigateToLikesPage();
          await this.tp.stop();
          await delay(1000);
          await this.updateSwipeJobToPending();
          process.exit(0);
        }
        if (likeCount && likeCount !== -1) {
          await this.updateLikeCount(likeCount);
        }

        const status = await this.checkCancelledStatus();
        if (status === "cancelled") {
          await this.markJobCancelled();
          process.exit(0);
          return;
        } else if (status !== "running") {
          // update job status to running
          await this.markJobRunning();
        }
      }

      const respondingOnDragAndDrop = await this.tp.dragAndDrop();
      console.log(respondingOnDragAndDrop, "result of dragAndDrop_+++++++++");

      if (respondingOnDragAndDrop) {
        tlog(`Doesn't find out the element in dragAndDrop`);
        // await this.tp.navigateToLikesPage();
        await this.tp.stop();
        await delay(1000);
        await this.updateSwipeJobToPending();
        process.exit(0);
      }

      if (currentPageUrl.includes("/app/matches")) {
        console.log("Navigate when faces matches page");
        const respondingOnGoLikePage = await this.tp.goLikesYouPage();
        if (respondingOnGoLikePage) {
          tlog(`Doesn't find out the element in dragAndDrop's goLikesYouPage`);
          // await this.tp.navigateToLikesPage();
          await this.tp.stop();
          await delay(1000);
          await this.updateSwipeJobToPending();
          process.exit(0);
        }
        await delay(2000);
        await this.incrementJobSwipes();
        continue;
      }
      tlog("liked user, count:", i);
      await this.incrementJobSwipes();
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 200);
      endSwipesCount = i;
    }
  }

  async incrementJobSwipesForRecommend() {
    await this.runQuery(
      `
      update swipe_jobs
      set swipes = swipes + 1, swiped_at = timezone('utc', now())
      where id = $1
    `,
      [this.jobID]
    );
    await this.runQuery(
      `
      update runs
      set swipes = swipes + 1
      where id = $1
    `,
      [this.runID]
    );
  }

  // move to tinderrecs
  async runRecommendedJob() {
    await this.tp.navigateToRecsPage();
    let likeCounter = 0;
    let passCounter = 0;
    for (let i = 1; i <= this.swipes; i++) {
      if (i % 100 === 0) {
        await delay(2000);
        if (this.tp.page !== undefined) {
          await this.tp.navigateToRecsPage();
        }
      }

      if (i % 4 == 0) {
        await this.tp.checkAndHandleErrors();
        try {
          await this.tp.waitForGamepadLikes();
        } catch (e) {
          await this.tp.checkAndHandleErrors();
        }
      }
      const random = Math.random();

      if (random >= 1 - this.recSwipePercentage / 100) {
        likeCounter += 1;
        await this.tp.clickLike();
      } else {
        passCounter += 1;
        await this.tp.clickPass();
      }

      if (i % 10 === 0) {
        await delay(1000);
        const status = await this.checkCancelledStatus();
        if (status === "cancelled") {
          await this.markJobCancelled();
          process.exit(0);
          return;
        } else if (status !== "running") {
          // update job status to running
          await this.markJobRunning();
        }
      }
      await this.incrementJobSwipes();
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 200);
      await delay(100);
    }
  }
  
  async runLocationChangeJob() {
    await this.tp.navigateToPassportPage();
    const allCountries = Object.keys(locationData);
    const country = allCountries[getRandom(0, allCountries.length - 1)];
    const cities = locationData[country];
    const city = cities[getRandom(0, cities.length - 1)];
    console.log(city);
    await delay(10000);
    await this.tp.queryChangeLocation(city);
  }

  async runStatusCheckJob() {
    await this.tp.navigateToRecsPage();

    let i = 0;
    let likeCounter = 0;
    let passCounter = 0;
    // await this.tp.checkAndHandleErrors();
    for await (const x of Array(this.swipes)) {
      i = i + 1;
      if (i % 100 === 0) {
        await delay(2000);
        if (this.tp.page !== undefined) {
          await this.tp.navigateToRecsPage();
        }
      }
      await this.tp.checkAndHandleErrors();
      const random = Math.random();
      try {
        await this.tp.waitForGamepadLikes();
      } catch (e) {
        await this.tp.checkAndHandleErrors();
      }

      if (random >= 1 - this.recSwipePercentage / 100) {
        likeCounter += 1;
        await this.tp.clickLike();
      } else {
        passCounter += 1;
        await this.tp.clickPass();
      }

      if (i % 10 === 0) {
        await delay(1000);
        const status = await this.checkCancelledStatus();
        if (status === "cancelled") {
          await this.markJobCancelled();
          process.exit(0);
          return;
        } else if (status !== "running") {
          // update job status to running
          await this.markJobRunning();
        }
      }
      await this.incrementJobSwipes();
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 200);
    }
  }

  async runLimitOfLikesJob() {
    await this.tp.navigateToRecsPage();

    let i = 0;
    let likeCounter = 0;
    let passCounter = 0;
    // await this.tp.checkAndHandleErrors();
    for await (const x of Array(this.swipes)) {
      i = i + 1;
      if (i % 100 === 0) {
        await delay(2000);
        if (this.tp.page !== undefined) {
          await this.tp.navigateToRecsPage();
        }
      }
      await this.tp.checkAndHandleErrors();
      const random = Math.random();
      try {
        await this.tp.waitForGamepadLikes();
      } catch (e) {
        await this.tp.checkAndHandleErrors();
      }

      if (random >= 1 - this.recSwipePercentage / 100) {
        likeCounter += 1;
        await this.tp.clickLike();
      } else {
        passCounter += 1;
        await this.tp.clickPass();
      }

      if (i % 10 === 0) {
        await delay(1000);
        const status = await this.checkCancelledStatus();
        if (status === "cancelled") {
          await this.markJobCancelled();
          process.exit(0);
          return;
        } else if (status !== "running") {
          // update job status to running
          await this.markJobRunning();
        }
      }
      await this.incrementJobSwipes();
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 200);
    }
  }
}
