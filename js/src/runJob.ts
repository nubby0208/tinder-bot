// runs the entire job
// handles management of all components
// shuts down the job gracefully
import dotenv from "dotenv";
dotenv.config();
import { program } from "commander";
import { tlog, sendTelegramMessage, terr, getDBClient } from "./utils";
import { SwipeJob } from "./swipeJob";
import TinderPage from "./tinderPage";

program.option("--debug").option("--sql-debug").option("--wait-on-failure");
program.parse();
const options = program.opts();

process.once("SIGTERM", async (code) => {
  terr("node SIGTERM received...!!!!!!!!!!");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  tlog("!!!!!!!!!!!!!uncaught exception!!!!!!!!!!!!!!!!!!!!!!!");
  sendTelegramMessage(err.stack ? err.stack : "error");
  console.log(err);
});

const runJob = async (jobID: number) => {
  let exitCode = 0;
  let sj: SwipeJob = new SwipeJob(jobID, options);
  let tp: TinderPage;
  try {
    await sj.Create();
    tp = new TinderPage(sj, { profileID: sj.profileID, apiToken: sj.apiToken });
    sj.setTinderPage(tp);
    await tp.start();
    process.on("SIGINT", async () => {
      await sj.markJobCancelled();
      process.exit(0);
    });
    exitCode = await sj.Run();
    await tp.stop();
  } catch (e: any) {
    tlog("RUNNER: failed", e);
    exitCode = await sj.handleFailure(e);
  } finally {
    tlog("RUNNER: exiting with code", exitCode);
    process.exit(exitCode);
  }
};

const args = process.argv.slice(2);
console.log(args[0], "*****");
runJob(parseInt(args[0]));
