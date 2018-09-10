const domain = require('domain') // eslint-disable-line
const extractRequestInfo = require('./request-info')
const createReportFromErr = require('@bugsnag/core/lib/report-from-error')
const handledState = {
  severity: 'error',
  unhandled: true,
  severityReason: {
    type: 'unhandledErrorMiddleware',
    attributes: { framework: 'Restify' }
  }
}

module.exports = {
  name: 'restify',
  init: client => {
    const requestHandler = (req, res, next) => {
      const dom = domain.create()

      // Start a session whether sessions are used or not. We use this
      // to store request-specific info, in case of any errors.
      const sessionClient = client.startSession()

      // attach it to the request
      req.bugsnag = sessionClient

      // extract request info and pass it to the relevant bugsnag properties
      const { request, metaData } = getRequestAndMetaDataFromReq(req)
      sessionClient.metaData = { ...sessionClient.metaData, request: metaData }
      sessionClient.request = request

      // unhandled errors caused by this request
      dom.on('error', (err) => {
        req.bugsnag.notify(createReportFromErr(err, handledState), {}, (e, report) => {
          if (e) return client._logger('Failed to send report to Bugsnag')
          req.bugsnag.config.onUncaughtException(err, report, client._logger)
        })
        if (!res.headersSent) {
          const body = 'Internal server error'
          res.writeHead(500, {
            'Content-Length': Buffer.byteLength(body),
            'Content-Type': 'text/plain'
          })
          res.end(body)
        }
      })

      return dom.run(next)
    }

    const errorHandler = (req, res, err, cb) => {
      if (err.statusCode && err.statusCode < 500) return cb()
      if (req.bugsnag) {
        req.bugsnag.notify(createReportFromErr(err, handledState))
      } else {
        client._logger.warn(
          'req.bugsnag is not defined. Make sure the @bugsnag/plugin-restify requestHandler middleware is added first.'
        )
        client.notify(createReportFromErr(err, handledState, getRequestAndMetaDataFromReq(req)))
      }
      cb()
    }

    return { requestHandler, errorHandler }
  }
}

const getRequestAndMetaDataFromReq = req => {
  const requestInfo = extractRequestInfo(req)
  return {
    metaData: requestInfo,
    request: {
      clientIp: requestInfo.clientIp,
      headers: requestInfo.headers,
      httpMethod: requestInfo.httpMethod,
      url: requestInfo.url,
      referer: requestInfo.referer
    }
  }
}

module.exports['default'] = module.exports