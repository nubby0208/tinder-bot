const { Client } = require("pg");
const moment = require("moment");
const Storage = require("node-storage");
const store = new Storage("utils/metadata.json");
const getDBClient = async () => {
  let client = new Client({
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "Professional123",
    port: 5432,
    // ssl: {
    //   rejectUnauthorized: false,
    // },
  });

  await client.connect();
  return client;
};

const runQuery = async (query, values) => {
  const connection = await getDBClient();
  const res = await connection.query(query, values);
  await connection.end();
  return res;
};
const getJobIds = async () => {
  const query = `
  select * from swipe_jobs where status = 'pending' or status = 'scheduled'`;
  const { rows } = await runQuery(query, []);
  let jobIds = [];
  const result = rows?.map((r) => {
    // const scheduleAt = r?.scheduled_at ?? r.created_at;
    // console.log(moment.utc(scheduleAt), moment.utc());
    // const diff = moment.utc().diff(moment.utc(scheduleAt), "hours");
    // console.log(diff, "diff");
    // if (diff <= 2) {
    jobIds.push({ id: r.id, delay: r.delay });
    // }
    return r;
  });

  const prevData = store.get("prevData");
  let newJobIds = [];
  if (jobIds.length > 0) {
    if (prevData && prevData.length > 0) {
      // console.log(prevData, "preData");
      // console.log(jobIds, "jobIds");
      newJobIds = jobIds.filter((jIdObj) => !prevData.some((pv) => pv.id === jIdObj.id));
    } else {
      console.log("No prevData");
      newJobIds = jobIds;
    }
  } else {
    newJobIds = jobIds;
  }
  console.log(newJobIds, "newJobIds");
  if (newJobIds.length > 0) {
    store.put("prevData", [...(prevData ?? []), ...newJobIds]);
  }

  // return jobIds;
};

module.exports = { getJobIds };
