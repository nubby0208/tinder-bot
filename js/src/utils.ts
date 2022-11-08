import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
import { Client } from "pg";
import { Page } from "playwright";

export const getDBClient = async () => {
  let client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    // ssl: {
    //     rejectUnauthorized: false,
    // }
  });

  await client.connect();
  return client;
};

const runQuery = async (query: string, values: any[]) => {
  const connection = await getDBClient();
  const res = await connection.query(query, values);
  await connection.end();
  return res;
};

export const tlog = async (...message: any[]) => {
  console.log("[" + new Date().toISOString().substring(11, 23) + "] -", ...message);
};

export const terr = async (...message: any[]) => {
  console.error("[" + new Date().toISOString().substring(11, 23) + "] -", ...message);
};

export const screenshotPath = path.join(__dirname, "../../rails/public/screenshots");

export const createLogDir = (jobID: number) => {
  fs.mkdir(path.join(screenshotPath, jobID.toString()), { recursive: true }, (err) => {
    if (err) {
      return console.error(err);
    }
  });
};

export const parseProfileJson = (json: string) => {
  let parsed = JSON.parse(json);

  if (parsed.meta.status == 401 || parsed.meta.status == 400) {
    console.error("unable to get profile");
    console.log(parsed);
    return;
  }

  let user = parsed.data.user;

  let selfieVerified;
  try {
    selfieVerified = user.badges[0].type == "selfie_verified";
  } catch (e) {
    selfieVerified = false;
  }
  try {
    if (!selfieVerified) {
      selfieVerified = user.user_interests.selfie_verification == "verified";
    }
  } catch (e) {
    selfieVerified = false;
  }

  let hasGold;
  try {
    hasGold = parsed.data.purchase.purchases[0].product_type == "gold";
  } catch (e) {
    hasGold = false;
  }

  return {
    id: user._id,
    gold: hasGold,
    age_filter_min: user.age_filter_min,
    age_filter_max: user.age_filter_max,
    birth_date: user.birth_date,
    create_date: user.create_date,
    bio: user.bio,
    name: user.name,
    selfie_verified: selfieVerified,
    phone: user.phone_id,
  };
  // console.log(user)
  // console.log(res)
};

export const saveCookie = (jobID: number, cookies: any) => {
  const cookieJson = JSON.stringify(cookies);
  const cookiePath = path.join(screenshotPath.toString(), jobID.toString(), "cookie.json");
  fs.writeFileSync(cookiePath, cookieJson);
}

export const loadCookie = (jobID: number) => {
  const cookiePath = path.join(screenshotPath.toString(), jobID.toString(), "cookie.json");
  const cookies = fs.readFileSync(cookiePath, 'utf8');
  const deserializedCookies = JSON.parse(cookies)
  return deserializedCookies;
}

export const sendUserTelegramMessage = async (userID: number, message: string) => {
  let res = await runQuery("select telegram_channel from users where id = $1", [userID]);
  if (!res.rows[0]) {
    tlog("did not find telegram channel ID for user", userID);
    return;
  }
  let channelID = res.rows[0].telegram_channel;
  // let channelID = '-1001673046168' prince
  // let channelID = '-1001665062594' //robert
  // let channelID = '-1001508178202' //frank
  // let channelID = '-1001756421565' //bijan
  const data = JSON.stringify({ chat_id: channelID, text: message });

  if (process.env.TELEGRAM_ENV != "production") {
    tlog("send telegram message in prod:");
    tlog("----->", message);
    return;
  }

  await axios
    .post("https://api.telegram.org/bot5342174081:AAG--n9K81UqHCkXTRohuADekJ0DgMrZRtc/sendMessage", data, {
      headers: { "Content-Type": "application/json" },
    })
    .then((res) => {
      // tlog("sent message", message)
    })
    .catch((err) => {
      console.error(err);
    });
};

export const sendTelegramMessage = async (message: string) => {
  const data = JSON.stringify({
    // chat_id: "-1001583991975", //gdl tinderbot
    chat_id: "-1001398165034",
    text: message,
  });

  if (process.env.TELEGRAM_ENV != "production") {
    tlog("send telegram message in prod:");
    tlog(message);
    return;
  }

  await axios
    .post("https://api.telegram.org/bot5342174081:AAG--n9K81UqHCkXTRohuADekJ0DgMrZRtc/sendMessage", data, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((res) => {
      // tlog(`Status: ${res.status}`);
      // tlog('Body: ', res.data);
    })
    .catch((err) => {
      console.error(err);
    });
};

export const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

export const delay = (time: number) => {
  if (time >= 5000) {
    tlog("delaying", time / 1000.0, "seconds");
  }
  return new Promise((r) => setTimeout(r, time));
};

export const delayWithFunction = async (fn: () => Promise<void>, time: number, innerDelay: number): Promise<void> => {
  if (time >= 5000) {
    tlog("delaying", time / 1000.0, "seconds");
  }

  let t1 = new Date().getTime();
  let t2 = new Date().getTime();

  while (t2 - t1 < time) {
    await fn();
    t2 = new Date().getTime();
    await delay(innerDelay);
  }
};

export const waitUntil = (condition: () => any) => {
  let sleepTime = 100;
  let duration = 0;
  return new Promise<void>((resolve) => {
    let interval = setInterval(() => {
      if (!condition() && duration < 30000) {
        duration += sleepTime;
        return;
      }

      clearInterval(interval);
      resolve();
    }, sleepTime);
  });
};

export const takeScreenshot = async (page: Page, jobID: number) => {
  const ssPath = path.join(screenshotPath, jobID.toString(), "screenshot.png");
  tlog("taking screenshot", ssPath);
  await page.screenshot({ path: ssPath, fullPage: true });
};

export const takeErrorScreenshot = async (page: Page, jobID: number) => {
  const ssPath = path.join(screenshotPath, jobID.toString(), "errscreenshot.png");
  tlog("error: save screenshot to", ssPath);
  await page.screenshot({ path: ssPath, fullPage: true });
  await saveHtml(page, jobID);
};

export const saveHtml = async (page: Page, jobID: number) => {
  const htmlPath = path.join(screenshotPath.toString(), jobID.toString(), "error.html");
  tlog("html path", htmlPath);
  let html = await page.$("html");
  if (html != null) {
    fs.writeFileSync(htmlPath.toString(), await html.evaluate((content) => content.innerHTML));
  }
};

export const saveJson = async (jobID: number, json: string) => {
  const jsonPath = path.join(screenshotPath.toString(), jobID.toString(), "profile.json");
  tlog("json jsonPath", jsonPath);
  fs.writeFileSync(jsonPath.toString(), json);
  try {
    return parseProfileJson(json);
  } catch (e) {
    console.log("failed parsing profile json", json);
    console.error(e);
  }
};

export const sleep = async (millis: number) => {
  return new Promise((resolve) => setTimeout(resolve, millis));
};

export const updateSwipeJobWithPending = async (jobID: number) => {
  const query = `
    SELECT status
    FROM swipe_jobs
    where id = $1`;
  const res = await runQuery(query, [jobID]);
  const status = res.rows[0].status;
  if (status !== 'cancelled') {
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
    await runQuery(query, [jobID]);
  }
};

export const updateSwipeJobWithNoGold = async (jobID: number) => {
  const query = `
    SELECT status
    FROM swipe_jobs
    where id = $1`;
  const res = await runQuery(query, [jobID]);
  const status = res.rows[0].status;
  if (status !== 'cancelled') {
    const query = `
      update swipe_jobs
      set
        gold=false
      where id = $1`;
    await runQuery(query, [jobID]);
  }
};

export const updateTinderAccountWithNoGold = async (accountId: number) => {
  const query = `
      update tinder_accounts
      set
        gold=false
      where id = $1`;
    await runQuery(query, [accountId]);
};

export const updateMarkJobFailed = async (jobID?: number, runID?: number) => {
  const query = `
    UPDATE swipe_jobs
      SET status='failed',
      failed_at=timezone('utc', now())
      where id = $1`;
  await runQuery(query, [jobID]);

  const query2 = `
    UPDATE runs
      SET status='failed',
      failed_at=timezone('utc', now()),
      failed_reason=$1
      where id = $2`;
  await runQuery(query2, ["Failed", runID]);
};

export const getRandom = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
};

