const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cron = require("node-cron");
const { getJobIds } = require("./utils/db");
const { spawn, exec, spawnSync } = require("child_process");
const Storage = require("node-storage");

const store = new Storage("utils/metadata.json");
const startServer = () => {
  const app = express();
  const port = process.env.PORT || 5000;
  app.use(cors());

  cron.schedule(
    "*/5 * * * * *",
    () => {
      getJobIds().then((jobIds) => {
        console.log("Running a job at 01:00");
        if (jobIds.length > 0) {
          console.log(jobIds.length);
          jobIds.forEach(({ id, delay }, index) => {
            setTimeout(() => {
              console.log(id, delay);
              const child = spawn("ts-node", ["js/src/runJob.ts", `${id}`, `--debug`], {
                shell: true,
                detached: true,
                stdio: "ignore",
              });
              child.unref();
            }, (index + 1) * 1000);
          });
        }
      });
      // const jobIds = await getJobIds();
      // jobIds.forEach(({ id, delay }, index) => {
      //   setTimeout(() => {
      //     console.log(id, delay);
      //     const child = spawn("ts-node", ["js/src/runJob.ts", `${id}`, `--debug`], {
      //       shell: true,
      //       detached: true,
      //       stdio: "ignore",
      //     });
      //   }, (index + 1) * 1000);

      //   // child.unref();
      // });
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  );
  // setInterval(() => {
  //   getJobIds().then((jobIds) => {
  //     console.log("Running a job at 01:00");
  //     if (jobIds.length > 0) {
  //       console.log(jobIds.length);
  //       jobIds.forEach(({ id, delay }, index) => {
  //         setTimeout(() => {
  //           console.log(id, delay);
  //           const child = spawn("ts-node", ["js/src/runJob.ts", `${id}`, `--debug`], {
  //             shell: true,
  //             detached: true,
  //             stdio: "ignore",
  //           });
  //           // child.unref();
  //         }, (index + 1) * 1000);
  //       });
  //     }
  //   });
  // }, 10000);

  app.listen(port, () => {
    console.log(`server is running on port:${port}`);
  });
};
startServer();
