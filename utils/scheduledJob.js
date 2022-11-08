const CronJob = require("node-cron");

exports.initScheduledJobs = () => {
  const scheduledJobFunction = CronJob.schedule("1 0 * * * *", () => {
    console.log("I'm executed on a schedule!");
  });

  scheduledJobFunction.start();
};
