# signalk-stash
All your Signal K data are belong to us

```
docker-compose -d up
cat  signalk-rawdata.log.2017-08-26T11 | bin/toStash
npm start
curl 'http://localhost:3000/signalk/v1/vessels/self/tracks?bbox=0,0,90,90&paths=navigation.speedOverGround' | json
open 'http://localhost:3000/signalk/v1/vessels/self/tracks?bbox=0,0,90,90&paths=navigation.speedOverGround'
```


```
{
  "type": "FeatureCollection",
  "properties": {
    "dataPaths": [
      "navigation.speedOverGround"
    ]
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "9cf52c24-344d-4b41-a235-4ff205d9a827",
        "startTime": "2017-08-26T08:00:14.663Z",
        "endTime": "2017-08-26T08:01:14.663Z",
        "name": "Track",
        "clippedStartTime": "2017-08-26T00:00:00.000Z",
        "clippedEndTime": "2017-08-26T00:00:00.000Z"
      },
      "geometry": {
        "type": "MultiLineString",
        "coordinates": [
          [
            [
              25.0958165,
              60.12517,
              0,
              1503705600000,
              3.18
            ]
          ]
        ]
      }
    }
  ]
}
```