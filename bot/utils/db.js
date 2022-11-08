
const { Client } = require("pg");
const { logger } = require("./utils");

const getDBClient = async () => {
  let client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false,
    }
  });

  await client.connect();
  return client;
};

const runQuery = async (query, values) => {
  return await (await getDBClient()).query(query, values);
};

const shadowBanSwipeCount = 20;

const saveStatus = async (data) => {
  //   const { profileId, msTime } = data;
  //   try {
  //     await prisma.swipeJob.create({ data: { profileId, msTime: +msTime } });
  //   } catch (error) {
  //     console.log(error);
  //   }
};

const getAccountByJobId = async (jobId) => {
  try {
    let query = `
            select
              tinder_accounts.id tinder_acc_id,
              retries,
              job_type,
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
            where swipe_jobs.id = ${jobId}`;
    let res = await runQuery(query, []);

    if (!res.rows[0]) {
      throw new Error("Job not found");
    }

    const tinderAccountID = res.rows[0].tinder_acc_id;
    const recSwipePercentage = res.rows[0].recommended_percentage;
    const retries = res.rows[0].retries;
    const disableImages = res.rows[0].disable_images;
    const accountStatus = res.rows[0].account_status;
    const jobType = res.rows[0].job_type;
    const swipeDelay = res.rows[0].swipe_delay;
    const profileID = res.rows[0].gologin_profile_id;
    const apiToken = res.rows[0].gologin_api_token;
    const name = res.rows[0].gologin_profile_name;
    const username = res.rows[0].username;
    const userID = res.rows[0].user_id;
    let swipes = res.rows[0].target;

    if (jobType == "status_check") {
      swipes = shadowBanSwipeCount + 1;
    }
    const delayVariance = parseFloat(res.rows[0].delay_variance);

    query = `
      INSERT INTO runs(swipe_job_id, created_at, updated_at)
      VALUES ( $1, timezone('utc', now()), timezone('utc', now()) ) RETURNING id`;
    let values = [jobId];
    res = await runQuery(query, values);
    runID = res.rows[0].id;

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
    await runQuery(query, [jobId]);

    const profileInfo = {
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
      swipes,
    };

    return profileInfo;
  } catch (error) {
    console.log(error);
    return { profileID: null };
  }
};

const markJobCompleted = async ({ jobId, profileInfo, status, updateAccount = true }) => {
  const { runID } = profileInfo;
  let query;
  let query2;

  if (updateAccount == null) {
    updateAccount = true;
  }

  if (updateAccount) {
    await updateAccountStatus(status, profileInfo, jobId);
    query = `
      update swipe_jobs
      set status='completed',
      completed_at=timezone('utc', now()),
      account_job_status_result='${status}'
      where id = ${jobId}`;
    query2 = `
      update runs
      set status='completed',
      completed_at=timezone('utc', now()),
      result='${status}'
      where id = ${runID}`;
  } else {
    query = `
      update swipe_jobs
      set status='completed',
      completed_at=timezone('utc', now()),
      failed_reason='${status}'
      where id = ${jobId}`;
    query2 = `
      update runs
      set status='completed',
      completed_at=timezone('utc', now()),
      failed_reason='${status}'
      where id = ${jobId}`;
  }

  await runQuery(query, []);
  await runQuery(query2, []);

  // TODO test me
  // if (this.jobType == "status_check") {
  //   logger("mark status check complete");
  //   await markStatusCheckCompleted();
  // }

  // accountStatus = status;
  // status = "completed";
  return { status: "completed" };
};

const updateAccountStatus = async (status, profileInfo, jobID) => {
  const { tinderAccountID, retries, accountStatus } = profileInfo;
  if (status == "proxy_error") {
    let query = `
      UPDATE tinder_accounts
        SET proxy_active=false,
        updated_at=timezone('utc', now()),
        status_updated_at=timezone('utc', now())
        where id = $1`;
    await runQuery(query, [tinderAccountID]);
  } else {
    let query = `
      UPDATE tinder_accounts
        SET status='${status}',
        updated_at=timezone('utc', now()),
        status_updated_at=timezone('utc', now())
        where id = $1`;
    await runQuery(query, [tinderAccountID]);

    query = `
      INSERT INTO account_status_updates (retry, before_status, status, tinder_account_id, created_at, updated_at, swipe_job_id)
      VALUES ($1,$2,$3,$4,timezone('utc', now()),timezone('utc', now()),$5)`;
    await runQuery(query, [retries, accountStatus, status, tinderAccountID, jobID]);

    // handle account status notification
    if (accountStatus != status && status == "captcha_required") {
      try {
        await sendUserTelegramMessage(userID, `captcha https://visadoo.com/tinder_account/${tinderAccountID}`);
      } catch (e) {
        logger("error sending user telegram message");
        console.log(e);
      }
    }
  }
};

const incrementJobSwipes = async (jobID, runID) => {
  let swipesSinceLastMatch = 1;
  await runQuery(
    `update swipe_jobs
    set swipes = swipes + 1, swiped_at = timezone('utc', now())
    where id = $1
  `,
    [jobID]
  );
  await runQuery(
    `update runs
    set swipes = swipes + 1
    where id = $1
  `,
    [runID]
  );
  // if more than 20 swipes have occured since last match, throw shadowbanned error
  logger("swipes since last match:", swipesSinceLastMatch);
  return swipesSinceLastMatch;

  // if (this.swipesSinceLastMatch >= this.shadowBanSwipeCount) {
  //   tlog(`more than ${this.shadowBanSwipeCount} swipes since last match. account considered shadowbanned`);
  //   throw new ShadowBannedError();
  // }
};
module.exports = { saveStatus, getAccountByJobId, markJobCompleted, updateAccountStatus, incrementJobSwipes };
