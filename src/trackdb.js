/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
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

const debug = require('debug')('trackDb')
const db = require('sqlite')
const geohash = require('ngeohash')
const uuidv4 = require('uuid/v4')
const groupBy = require('lodash.groupby')

module.exports = { createTrackDb }

function createTrackDb (app) {
  let trackDb
  let unsubscribes = []
  let lastWrite = 0
  let trackId
  let minInterval = 60 * 1000
  const trackCutoffInterval = 20 * 60 * 1000

  db
    .open('track.sqlite')
    .then(opened => {
      debug('track db opened')
      trackDb = opened
      return trackDb.run(
        `
      CREATE TABLE IF NOT EXISTS trackdata(
        track number NOT NULL,
        timestamp number NOT NULL,
        geohash text NOT NULL,
        latitude number NOT NULL,
        longitude number NOT NULL
      )`
      )
    })
    .then(_ => {
      return trackDb.run(
        `
      CREATE TABLE IF NOT EXISTS track(
        id INTEGER PRIMARY KEY,
        name text,
        uuid text NOT NULL
      )`
      )
    })
    .catch(error => {
      console.error(error)
    })

  return {
    writePositions: positions => {
      if (positions.length === 0) {
        return Promise.resolve()
      }
      if (positions.length > 1) {
        return Promise.reject(
          new Error('Can write only one position at a time')
        )
      }
      const position = positions[0].value
      const timestampMillis = positions[0].timestamp.getTime()
      if (timestampMillis - lastWrite > minInterval) {
        let trackIdP = !trackId ||
          timestampMillis - lastWrite > trackCutoffInterval
          ? newTrackId(trackDb, timestampMillis)
          : Promise.resolve(trackId)

        lastWrite = timestampMillis

        return trackIdP.then(theTrackId => {
          trackId = theTrackId
          return trackDb
            .prepare(
              `INSERT INTO trackdata(track, timestamp, geohash, latitude, longitude) 
             VALUES(:track, :timestamp, :geohash, :latitude, :longitude)`,
            {
              ':track': theTrackId,
              ':timestamp': timestampMillis,
              ':geohash': geohash.encode(
                  position.latitude,
                  position.longitude
                ),
              ':latitude': JSON.stringify(position.latitude),
              ':longitude': JSON.stringify(position.longitude)
            }
            )
            .then(stmt => stmt.run())
            .then(stmt => stmt.finalize())
        })
      }
    },
    getPeriods: function (bboxString) {
      return getPeriods(trackDb, boundsToHashes(bboxString))
    }
  }
}

function getPeriods (trackDb, geohashes) {
  return getTrackData(trackDb, geohashes)
    .then(rows => groupBy(rows, row => row.uuid))
    .then(trackSegmentsByUuid => {
      debug(trackSegmentsByUuid)
      return Object.keys(trackSegmentsByUuid).map(trackUuid => ({
        id: trackUuid,
        start: new Date(
          trackSegmentsByUuid[trackUuid][0].timestamp
        ).toISOString(),
        end: new Date(
          trackSegmentsByUuid[trackUuid].slice(-1)[0].timestamp + 60 * 1000
        ).toISOString()
      }))
    })
}

// @bboxString southwest_lng,southwest_lat,northeast_lng,northeast_lat
function boundsToHashes (bboxString) {
  const bbox = bboxString.split(',')
  let result = []
  let precision = 0
  let hashes = []
  while (++precision <= 9 && hashes.length <= 32) {
    result = hashes
    hashes = geohash.bboxes(bbox[1], bbox[0], bbox[3], bbox[2], precision)
  }
  return result
}

function getTrackData (trackDb, hashes) {
  if (trackDb) {
    const query = `
        SELECT
        trackdata.timestamp, track.uuid
        FROM
        trackdata
        INNER JOIN
        track
        ON trackdata.track = track.id
        where ${hashesToWhereClause(hashes)}
        ORDER BY timestamp
      `
    return trackDb.all(query)
  }
  return Promise.resolve([])
}

function hashesToWhereClause (hashes) {
  const result = hashes.map(hash => `geohash like '${hash}%'`).join(' OR ')
  debug(result)
  return result
}

function newTrackId (trackDb, name) {
  return trackDb
    .run(`INSERT INTO track(name, uuid) values('${name}','${uuidv4()}')`)
    .then(_ => trackDb.get('SELECT max(id) FROM track'))
    .then(row => Promise.resolve(row['max(id)']))
}
