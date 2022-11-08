class CustomError extends Error {
  someProperty;
  constructor(message, someProperty = null) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.someProperty = someProperty;
  }
}

// you can check all error types here

class StatusCheckComplete extends CustomError {
  constructor() {
    super("Status Check Finished");
  }
}

class ShadowBannedError extends CustomError {
  constructor() {
    super(">15 swipes since last match - account shadowbanned");
  }
}

class ProfileVerificationError extends CustomError {
  constructor() {
    super("Thank you your account is under review");
  }
}

class RanOutOfLikesError extends CustomError {
  constructor() {
    super("Ran out of likes");
  }
}

class AccountLoggedOutError extends CustomError {
  constructor() {
    super("Account Logged Out");
  }
}

class ProxyError extends CustomError {
  constructor() {
    super("ProxyError");
  }
}

class AlreadyFinishedError extends CustomError {
  constructor() {
    super("Finished running already");
  }
}

class AccountBannedError extends CustomError {
  constructor() {
    super("Account Banned");
  }
}

class AgeRestrictedError extends CustomError {
  constructor() {
    super("Age Restricted");
  }
}

class CaptchaRequiredError extends CustomError {
  constructor() {
    super("Tinder Presenting Captcha");
  }
}

class IdentityVerificationRequired extends CustomError {
  constructor() {
    super("IdentityVerificationRequired");
  }
}

class AccountUnderReviewError extends CustomError {
  constructor() {
    super("Account Under Review");
  }
}

class OutOfLikesError extends CustomError {
  constructor() {
    super("Out Of Likes");
  }
}

module.exports = {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  AgeRestrictedError,
  AlreadyFinishedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  ProfileVerificationError,
  ProxyError,
  RanOutOfLikesError,
  ShadowBannedError,
  StatusCheckComplete,
};
