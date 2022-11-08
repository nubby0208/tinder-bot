const { Client } = require("pg");
const moment = require("moment");
const Storage = require("node-storage");
const store = new Storage("utils/metadata.json");
const getDBClient = async () => {
  let client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
    // ssl: {
    //   rejectUnauthorized: false,
    // },
  });

  await client.connect();
  return client;
};

// const runQuery = async (query, values) => {
//   return await (await getDBClient()).query(query, values);
// };

const runQuery = async (query, values) => {
  const connection = await getDBClient();
  const res = await connection.query(query, values);
  await connection.end();
  return res;
};

const getJobIds = async (count) => {
  if (count !== 0 && count % 60 === 0) {
    store.remove("prevData");
  }

  const query = `
  select * from swipe_jobs where status = 'pending'`;
  const { rows } = await runQuery(query, []);
  let jobIds = [];
  const result = rows?.map((r) => {
    jobIds.push({ id: r.id, delay: r.delay });
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

  if (newJobIds.length > 3) {
    newJobIds = newJobIds.filter((obj, index) => index < 3);
  }
  // console.log(newJobIds, "newJobIds");

  if (newJobIds.length > 0) {
    store.put("prevData", [...(prevData ?? []), ...newJobIds]);
  }

  return newJobIds;
};

module.exports = { getJobIds };
