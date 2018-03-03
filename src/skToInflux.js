/*
 * Copyright 2018 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Influx = require('influx')
const debug = require('debug')('signalk-to-influxdb')

module.exports = {
  deltaToPointsConverter: (selfContext, useDeltaTimestamp = false) => {
    return delta => {
      if (delta.context === 'vessels.self') {
        delta.context = selfContext
      }
      let points = []
      if (delta.updates && delta.context === selfContext) {
        delta.updates.forEach(update => {
          if (update.values) {
            points = update.values.reduce((acc, pathValue) => {
              if (shouldStore(pathValue.path, update['$source'])) {
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
                    point.timestamp = new Date(update.timestamp)
                  }
                  acc.push(point)
                }
              }
              return acc
            }, [])
          }
        })
      }
      return points
    }
  },
  influxDb: ({ host, port, database }) => {
    const clientP = new Promise((resolve, reject) => {
      const client = new Influx.InfluxDB({
        host: host,
        port: port, // optional, default 8086
        protocol: 'http', // optional, default 'http'
        database: database
      })

      client
        .getDatabaseNames()
        .then(names => {
          debug('Connected')
          if (names.includes(database)) {
            resolve(client)
          } else {
            client.createDatabase(database).then(result => {
              debug('Created InfluxDb database ' + database)
              resolve(client)
            })
          }
        })
        .catch(err => {
          reject(err)
        })
    })
    return {
      writePoints: points =>
        clientP.then(client => {
          return client.writePoints(points)
        }),
      query: queries =>
        clientP.then(client => {
          return client.query(queries)
        })
    }
  }
}
