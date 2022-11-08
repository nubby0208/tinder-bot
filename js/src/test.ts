// import fs from "fs";

// const rawLocationData = fs.readFileSync("./constants/locations.js");
// const locationData = JSON.parse(rawLocationData);

const locationData = require('./constants/locations.json');

const getRandom = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
};

const allCountries = Object.keys(locationData);
const country = allCountries[getRandom(0, allCountries.length - 1)];
const cities = locationData[country];
const city = cities[getRandom(0, cities.length - 1)];
console.log(city);





