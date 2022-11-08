import { SwipeJob } from '../src/swipeJob'
import dotenv from 'dotenv'
import { AccountBannedError, AccountLoggedOutError, AccountUnderReviewError, AgeRestrictedError, CaptchaRequiredError, IdentityVerificationRequired, OutOfLikesError, ProfileVerificationError, ShadowBannedError, StatusCheckComplete } from '../src/errors';
import TinderPage from '../src/tinderPage';
import { Page } from 'playwright';


process.env.NODE_ENV="test"
dotenv.config({ path: "tests/.env" })

describe('checkAndHandleErrors', () => {
  it('throws AccountBannedError when app/banned is in URL', async () => {
    expect.assertions(1);
    const job = new SwipeJob(131, {})
    await job.Create()
    const tp = new TinderPage(job, {
        profileID: job.profileID,
        apiToken: job.apiToken
    })

    jest.spyOn(tp, 'getURL').mockReturnValue("https://tinder.com/app/banned")

    try {
      await tp.checkAndHandleErrors()
    } catch(e) {
      expect(e).toBeInstanceOf(AccountBannedError)
    }

    await job.client.end()
  })

  it('throws verification error when verify/identity is in URL', async () => {
    expect.assertions(1);
    const job = new SwipeJob(131, {})
    await job.Create()
    const tp = new TinderPage(job, {
        profileID: job.profileID,
        apiToken: job.apiToken
    })

    jest.spyOn(tp, 'getURL').mockReturnValue("https://tinder.com/verify/identity")

    try {
      await tp.checkAndHandleErrors()
    } catch(e) {
      expect(e).toBeInstanceOf(IdentityVerificationRequired)
    }

    await job.client.end()
  })

  it('throws captcha error when verify/challenge is in URL', async () => {
    expect.assertions(1);
    const job = new SwipeJob(131, {})
    await job.Create()
    const tp = new TinderPage(job, {
        profileID: job.profileID,
        apiToken: job.apiToken
    })

    jest.spyOn(tp, 'getURL').mockReturnValue("https://tinder.com/verify/challenge")

    try {
      await tp.checkAndHandleErrors()
    } catch(e) {
      expect(e).toBeInstanceOf(CaptchaRequiredError)
    }

    await job.client.end()
  })

  it('throws logged_out when verify/challenge is in URL', async () => {
    expect.assertions(1);
    const job = new SwipeJob(131, {})
    await job.Create()
    const tp = new TinderPage(job, {
      profileID: job.profileID,
      apiToken: job.apiToken
    })

    jest.spyOn(tp, 'getURL').mockReturnValue("https://tinder.com/")

    try {
      await tp.checkAndHandleErrors()
    } catch(e) {
      console.log(e)
      expect(e).toBeInstanceOf(AccountLoggedOutError)
    }

    await job.client.end()
  })
});
