// errors {{{
class CustomError extends Error {
  someProperty: any;
  constructor(message: string, someProperty=null) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.someProperty = someProperty;
  }
}

export class StatusCheckComplete extends CustomError {
  constructor() { super('Status Check Finished'); }
}

export class ShadowBannedError extends CustomError {
  constructor() { super('>15 swipes since last match - account shadowbanned'); }
}

export class ProfileVerificationError extends CustomError {
  constructor() { super('Thank you your account is under review'); }
}

export class RanOutOfLikesError extends CustomError {
  constructor() { super('Ran out of likes'); }
}

export class LimitOfLikesError extends CustomError {
  constructor() { super('Limit of likes'); }
}

export class AccountLoggedOutError extends CustomError {
  constructor() { super('Account Logged Out'); }
}

export class ProfileNoGoldError extends CustomError {
  constructor() { super('Profile is not gold'); }
}

export class ProxyError extends CustomError {
  constructor() { super('ProxyError'); }
}

export class AlreadyFinishedError extends CustomError {
  constructor() { super('Finished running already'); }
}

export class AccountBannedError extends CustomError {
  constructor() { super('Account Banned'); }
}

export class AgeRestrictedError extends CustomError {
  constructor() { super('Age Restricted'); }
}

export class CaptchaRequiredError extends CustomError {
  constructor() { super('Tinder Presenting Captcha'); }
}

export class IdentityVerificationRequired extends CustomError {
  constructor() { super('IdentityVerificationRequired'); }
}

export class AccountUnderReviewError extends CustomError {
  constructor() { super('Account Under Review'); }
}

export class OutOfLikesError extends CustomError {
  constructor() { super('Out Of Likes'); }
}

module.exports = {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  ProfileNoGoldError,
  AgeRestrictedError,
  AlreadyFinishedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  LimitOfLikesError,
  ProfileVerificationError,
  ProxyError,
  RanOutOfLikesError,
  ShadowBannedError,
  StatusCheckComplete,
}
