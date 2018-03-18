/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

const Bacon = require('baconjs')
const debug = require('debug')('signalk-to-influxdb')
const util = require('util')
const ToStash = require('./src/toStash')

module.exports = function (app) {
  const logError =
    app.error ||
    (err => {
      console.error(err)
    })
  const unsubscribes = []
  let toStash = null

  return {
    id: 'stash',
    name: 'Stash for Signal K data',
    description: 'Plugin to write all SK data to db and provide APIs on it',

    schema: {
      type: 'object',
      required: ['influx'],
      properties: {
        influx: {
          type: 'object',
          title: 'InfluxDb',
          required: ['host', 'port', 'database'],
          properties: {
            host: {
              type: 'string',
              title: 'host',
              default: 'localhost'
            },
            port: {
              type: 'number',
              title: 'InfluxDb ort',
              default: 8086
            },
            database: {
              type: 'string',
              title: 'Database',
              default: 'signalk'
            }
          }
        },
        blackOrWhite: {
          type: 'string',
          title: 'Type of List',
          description: 'With a blacklist, all numeric values except the ones in the list below will be stored in InfluxDB. With a whitelist, only the values in the list below will be stored.',
          default: 'Black',
          enum: ['White', 'Black']
        },
        blackOrWhitelist: {
          title: 'SignalK Paths',
          description: 'A list of SignalK paths to be exluded or included based on selection above',
          type: 'array',
          items: {
            type: 'string',
            title: 'Path'
          }
        }
      }
    },

    start: function (options) {
      const isForInflux = getBlackOrWhiteListFilter(options)
      toStash = new ToStash({ selfId: app.selfId, ...options })
      handleDelta = delta => {}
      const deltaHandler = delta => {
        toStash.write(delta)
      }
      app.signalk.on('delta', deltaHandler)
      unsubscribes.push(() => {
        app.signalk.removeListener('delta', deltaHandler)
        toStash.end()
        toStash = null
      })
    },
    stop: function () {
      unsubscribes.forEach(f => f())
    }
  }
}

function getBlackOrWhiteListFilter (options) {
  if (
    typeof options.blackOrWhitelist !== 'undefined' &&
    typeof options.blackOrWhite !== 'undefined' &&
    options.blackOrWhitelist.length > 0
  ) {
    const paths = {}

    options.blackOrWhitelist.forEach(element => {
      paths[element] = true
    })

    if (options.blackOrWhite == 'White') {
      return path => typeof paths[path] !== 'undefined'
    } else {
      return path => typeof paths[path] === 'undefined'
    }
  } else {
    return () => true
  }
}
