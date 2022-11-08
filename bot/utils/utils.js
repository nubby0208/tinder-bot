const logger = async (...message) => {
  console.log("[" + new Date().toISOString().substring(11, 23) + "] -", ...message);
};

//don't use yet
const saveJson = async (jobID, json) => {
  try {
    return parseProfileJson(json);
  } catch (e) {
    console.log("failed parsing profile json", json);
    console.error(e);
  }
};

const parseProfileJson = async (json) => {
  let parsed = json;
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

module.exports = { logger, saveJson, parseProfileJson };
