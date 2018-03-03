const Influx = require('influx')
const debug = require('debug')('toStash')

const { Transform } = require('stream')
const { createTrackDb } = require('./trackdb')
const { deltaToPointsConverter, influxDb } = require('./skToInflux')

class ToStash extends Transform {
  constructor (options) {
    super({
      objectMode: true
    })
    this.trackDb = createTrackDb()
    this.selfContext = 'vessels.' + options.selfId
    this.influxDb = influxDb(options.influx)
    this.points = []
    this.lastPositionStored = 0
  }
}

ToStash.prototype._transform = function (delta, encoding, done) {
  const { points, positions } = this.deltaToInsertables(delta)
  this.points = this.points.concat(points)
  const promises = [this.trackDb.writePositions(positions)]
  if (this.points.length > 1000) {
    promises.push(this.influxDb.writePoints(points))
  }
  Promise.all(promises)
    .then(_ => {
      done()
    })
    .catch(err => {
      done()
    })
}

ToStash.prototype.deltaToInsertables = function(
  delta,
  isForInflux = () => true, // option for black/whitelisting paths for InfluxDb storage
  useDeltaTimestamp = true
) {
  let points = []
  let positions = []
  if (delta.updates && (delta.context === this.selfContext || !delta.context)) {
    delta.updates.forEach(update => {
      if (update.values) {
        const timestamp = useDeltaTimestamp
          ? new Date(update.timestamp)
          : new Date()
        points = update.values.reduce((acc, pathValue) => {
          if (pathValue.path === 'navigation.position') {
            positions.push({ value: pathValue.value, timestamp })

            if (timestamp.getTime() - this.lastPositionStored > 1000) {
              console.log('position')
              acc.push({
                measurement: pathValue.path,
                timestamp: timestamp,
                fields: {
                  value: JSON.stringify([
                    pathValue.value.longitude,
                    pathValue.value.latitude
                  ])
                }
              })
              this.lastPositionStored = timestamp.getTime()
            }
          }
          if (isForInflux(pathValue.path, update['$source'])) {
            if (
              typeof pathValue.value === 'number' &&
              !isNaN(pathValue.value)
            ) {
              const point = {
                measurement: pathValue.path,
                fields: {
                  value: pathValue.value
                }
              }
              if (useDeltaTimestamp) {
                point.timestamp = timestamp
              }
              acc.push(point)
            }
          }
          return acc
        }, [])
      }
    })
  }
  return { points, positions }
}

module.exports = ToStash
