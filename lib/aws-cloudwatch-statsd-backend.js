var util = require('util');
var AWS = require('aws-sdk');

function CloudwatchBackend(startupTime, config, emitter) {
  var self = this;

  this.config = config.cloudwatch || {};
  this.cloudwatch = new AWS.CloudWatch(config.cloudwatch);

  this.config.batchSize = this.config.batchSize || 20;

  // attach
  emitter.on('flush', function (timestamp, metrics) {
    self.flush(timestamp, metrics);
  });
};

CloudwatchBackend.prototype.processKey = function (key) {
  var parts = key.split(/[\.\/-]/);

  return {
    metricName : parts[parts.length - 1],
    namespace : parts.length > 1 ? parts.splice(0, parts.length - 1).join("/") : null
  };
}

CloudwatchBackend.prototype.flush = function (timestamp, metrics) {

  console.log('Flushing metrics at ' + new Date(timestamp * 1000).toISOString());

  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var sets = metrics.sets;
  var metricData = [];

  for (key in counters) {
    if (key.indexOf('statsd.') == 0)
      continue;

    if (this.config.whitelist && this.config.whitelist.length > 0 && this.config.whitelist.indexOf(key) == -1) {
      console.log("Key (counter) " + key + " not in whitelist");
      continue;
    }

    var names = this.config.processKeyForNamespace ? this.processKey(key) : {};
    var metricName = this.config.metricName || names.metricName || key;
    var dimensions = this.config.dimensions;

    metricData[metricData.length] = {
      MetricName : metricName,
      Unit : 'Count',
      Dimensions : dimensions,
      Timestamp : new Date(timestamp * 1000).toISOString(),
      Value : counters[key]
    };

  }

  for (key in timers) {
    if (timers[key].length > 0) {

      if (this.config.whitelist && this.config.whitelist.length > 0 && this.config.whitelist.indexOf(key) == -1) {
        console.log("Key (counter) " + key + " not in whitelist");
        continue;
      }

      var values = timers[key].sort(function (a, b) {
          return a - b;
        });
      var count = values.length;
      var min = values[0];
      var max = values[count - 1];

      var cumulativeValues = [min];
      for (var i = 1; i < count; i++) {
        cumulativeValues.push(values[i] + cumulativeValues[i - 1]);
      }

      var sum = min;
      var mean = min;
      var maxAtThreshold = max;

      var message = "";

      var key2;

      sum = cumulativeValues[count - 1];
      mean = sum / count;

      var names = this.config.processKeyForNamespace ? this.processKey(key) : {};
      var metricName = this.config.metricName || names.metricName || key;
      var dimensions = this.config.dimensions;

      metricData[metricData.length] = {
        MetricName : metricName,
        Unit : 'Milliseconds',
        Dimensions : dimensions,
        Timestamp : new Date(timestamp * 1000).toISOString(),
        StatisticValues : {
          Minimum : min,
          Maximum : max,
          Sum : sum,
          SampleCount : count
        }
      };

    }

  }

  for (key in gauges) {

    if (this.config.whitelist && this.config.whitelist.length > 0 && this.config.whitelist.indexOf(key) == -1) {
      console.log("Key (counter) " + key + " not in whitelist");
      continue;
    }

    var names = this.config.processKeyForNamespace ? this.processKey(key) : {};
    var metricName = this.config.metricName || names.metricName || key;
    var dimensions = this.config.dimensions;

    metricData[metricData.length] = {
      MetricName : metricName,
      Unit : 'None',
      Dimensions : dimensions,
      Timestamp : new Date(timestamp * 1000).toISOString(),
      Value : gauges[key]
    };

  }

  for (key in sets) {

    if (this.config.whitelist && this.config.whitelist.length > 0 && this.config.whitelist.indexOf(key) == -1) {
      console.log("Key (counter) " + key + " not in whitelist");
      continue;
    }

    var names = this.config.processKeyForNamespace ? this.processKey(key) : {};
    var metricName = this.config.metricName || names.metricName || key;
    var dimensions = this.config.dimensions;

    metricData[metricData.length] = {
      MetricName : metricName,
      Unit : 'None',
      Dimensions : dimensions,
      Timestamp : new Date(timestamp * 1000).toISOString(),
      Value : sets[key].values().length
    };
  }

  var namespace = this.config.namespace || "AwsCloudWatchStatsdBackend";
  while (metricData.length > 0) {
    var chunk = metricData.splice(0, this.config.batchSize);
    console.log('pushing ' + chunk.length + ' metrics to cloudwatch');
    this.cloudwatch.putMetricData({
      MetricData : chunk,
      Namespace : namespace
    },
      function (err, data) {
      if (err) {
        console.log(util.inspect(err));
      }
      console.log(util.inspect(data));
    });
  }
};

exports.init = function (startupTime, config, events) {
  var instance = new CloudwatchBackend(startupTime, config, events);
  return true;
};

