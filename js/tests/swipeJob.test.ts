import { SwipeJob } from '../src/swipeJob'
import dotenv from 'dotenv'
import { AccountBannedError, AccountLoggedOutError, AccountUnderReviewError, AgeRestrictedError, IdentityVerificationRequired, OutOfLikesError, ProfileVerificationError, ShadowBannedError, StatusCheckComplete } from '../src/errors';

process.env.NODE_ENV="test"
dotenv.config({ path: "tests/.env" })

describe('testing postgres', () => {
  it('mark account age_restricted when status AgeRestrictedError', async () => {
    expect.assertions(25);
    const job = new SwipeJob(131, {})
    await job.Create()
    let exitCode: number

    exitCode = exitCode = await job.handleFailure(new ShadowBannedError())
    expect(job.accountStatus).toBe("shadowbanned")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new AgeRestrictedError())
    expect(job.accountStatus).toBe("age_restricted")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    const removeAccountLocation = jest.spyOn(job, 'removeAccountLocation')
    exitCode = await job.handleFailure(new AccountBannedError())
    expect(job.accountStatus).toBe("banned")
    expect(job.status).toBe("completed")
    expect(removeAccountLocation).toHaveBeenCalled()
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new IdentityVerificationRequired())
    expect(job.accountStatus).toBe("identity_verification")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new AccountUnderReviewError())
    expect(job.accountStatus).toBe("under_review")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new OutOfLikesError())
    expect(job.accountStatus).toBe("out_of_likes")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new AccountLoggedOutError())
    expect(job.accountStatus).toBe("logged_out")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    exitCode = await job.handleFailure(new ProfileVerificationError())
    expect(job.accountStatus).toBe("verification_required")
    expect(job.status).toBe("completed")
    expect(exitCode).toBe(0)

    await job.client.end()
  })

  it('mark complete when status check complete', async () => {
    expect.assertions(1);
    const job = new SwipeJob(131, {})
    await job.Create()

    const exitCode = await job.handleFailure(new StatusCheckComplete())

    expect(job.status).toBe("completed")
    await job.client.end()        
  })

  it('mark failed when unexpected error', async () => {
    expect.assertions(2);
    const job = new SwipeJob(131, {})
    await job.Create()
    job.retries = 0
    job.jobType = 'status_check'

    let exitCode = await job.handleFailure(new Error("unexpected"))

    expect(job.status).toBe("failed")
    expect(exitCode).toEqual(1)
    await job.client.end()        
  })

  it('not retry when unexpected error, status_check, retries over 3', async () => {
    expect.assertions(3);
    const job = new SwipeJob(131, {})
    const spy = jest.spyOn(job, 'notifyError')
    await job.Create()
    job.retries = 5
    job.jobType = 'status_check'
    
    let exitCode = await job.handleFailure(new Error("unexpected"))
    
    expect(spy).toHaveBeenCalled()
    expect(job.status).toBe("failed")
    expect(exitCode).toEqual(0)
    await job.client.end()        
  })

  it('retry when unexpected error, likes and retries under 3', async () => {
    expect.assertions(2);
    const job = new SwipeJob(131, {})
    await job.Create()
    job.retries = 0
    job.jobType = 'likes'

    let exitCode = await job.handleFailure(new Error("unexpected"))

    expect(job.status).toBe("failed")
    expect(exitCode).toEqual(1)
    await job.client.end()        
  })

  it('not retry when unexpected error, likes and retries over 3', async () => {
    expect.assertions(2);
    const job = new SwipeJob(131, {})
    await job.Create()
    job.retries = 5
    job.jobType = 'likes'

    let exitCode = await job.handleFailure(new Error("unexpected"))

    expect(job.status).toBe("failed")
    expect(exitCode).toEqual(0)
    await job.client.end()        
  })

  it('should not error if id exists', async () => {
    expect.assertions(0);
    let sj = new SwipeJob(131, {})
    try {
      await sj.Create()
    } catch(err) {
      expect(err).toBeInstanceOf(Error);
    } finally {
      await sj.client.end()        
    }
  })

  it('should error if id doesnt exist', async () => {
    expect.assertions(1);
    let sj = new SwipeJob(-1, {})
    try {
      await sj.Create()
    } catch(err) {
      expect(err).toBeInstanceOf(Error);
    } finally {
      await sj.client.end()        
    }
  })
});