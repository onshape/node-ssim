'use strict';

var fs = require('fs');
var PNG = require('pngjs').PNG;

function SSIM() {
  var self = this;
  var Channels = { '1': 'Grey',
                   '2': 'GreyAlpha',
                   '3': 'RGB',
                   '4': 'RGBAlpha',
                   Grey: 1,
                   GreyAlpha: 2,
                   RGB: 3,
                   RGBAlpha: 4 };

  self.loadImage = function(filePath, done) {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function () {
        done({
          data: this.data,
          width: this.width,
          height: this.height,
          channels: 4
        });
      });
  };

  self.generateDifference = function(image1, image2, outputFileName, callback) {
    var total = image1.height * image1.width * 4;
    var difference  = new Buffer(total);

    var ae = [ 0, 0, 0, 0];
    var mae = [ 0, 0, 0, 0 ];
    var fuzz = 64; // absolute color channel distance

    for(var offset = 0; offset < total; offset += 4) {

        var red1 = image1.data[offset];
        var green1 = image1.data[offset + 1];
        var blue1 = image1.data[offset + 2];
        var alpha1 = image1.data[offset + 3];

        var red2 = image2.data[offset];
        var green2 = image2.data[offset + 1];
        var blue2 = image2.data[offset + 2];
        var alpha2 = image2.data[offset + 3];

        var distances = [ Math.abs(red2 - red1),
                          Math.abs(green2 - green1),
                          Math.abs(blue2 - blue1),
                          Math.abs(alpha2 - alpha1) ];

        var match = true;
        distances.forEach(function(dist) {
          if (dist > fuzz) {
            match = false;
          }
        });

        if (match) {
          difference[offset] = red1;
          difference[offset + 1] = green1;
          difference[offset + 2] = blue1;
          difference[offset + 3] = 100;
        } else {
          difference[offset] = 255;
          difference[offset + 1] = 0;
          difference[offset + 2] = 0;
          difference[offset + 3] = 255;

          ae[0] += distances[0];
          ae[1] += distances[1];
          ae[2] += distances[2];
          ae[3] += distances[3];
        }
    }

    mae[0] = ae[0] / total;
    mae[1] = ae[1] / total;
    mae[2] = ae[2] / total;
    mae[3] = ae[3] / total;

    var result = { ae: ae, mae: mae };

    if (outputFileName) {
      var png = new PNG();
      png.width = image1.width;
      png.height = image1.height;
      png.data = difference;

      png.pack().pipe(fs.createWriteStream(outputFileName)).on('close', function() {
        callback(result);
      });
    } else {
      callback(result);
    }
  };

  self.compare = function(image1, image2, windowSize, K1, K2, luminance, bitsPerComponent) {
    if (windowSize === undefined) {
      windowSize = 64; // default 8 x 8 window size
    }
    if (K1 === undefined) {
      K1 = 0.01; // default k1 of 0.01
    }
    if (K2 === undefined) {
      K2 = 0.03; // default k2 of 0.03
    }
    if (luminance === undefined) {
      luminance = true;
    }
    if (bitsPerComponent === undefined) {
      bitsPerComponent = 8;
    }
    if (image1.width !== image2.width || image1.height !== image2.height) {
      return { ssim: 0, mcs: 0 };
    }

    var L = (1 << bitsPerComponent) - 1;
    var c1 = Math.pow((K1 * L), 2);
    var c2 = Math.pow((K2 * L), 2);
    var numWindows = 0;
    var mssim = 0.0;
    var mcs = 0.0;

    function iteration(lumaValues1, lumaValues2, averageLumaValue1, averageLumaValue2) {
      // calculate variance and covariance
      var sigxy, sigsqx, sigsqy;
      sigxy = sigsqx = sigsqy = 0.0;

      for (var i = 0; i < lumaValues1.length; i++) {
        sigsqx += Math.pow((lumaValues1[i] - averageLumaValue1), 2);
        sigsqy += Math.pow((lumaValues2[i] - averageLumaValue2), 2);
        sigxy += (lumaValues1[i] - averageLumaValue1) * (lumaValues2[i] - averageLumaValue2);
      }

      var numPixelsInWin = lumaValues1.length - 1;

      sigsqx /= numPixelsInWin;
      sigsqy /= numPixelsInWin;
      sigxy /= numPixelsInWin;

      // perform ssim calculation on window
      var numerator = (2 * averageLumaValue1 * averageLumaValue2 + c1) * (2 * sigxy + c2);
      var denominator = (Math.pow(averageLumaValue1, 2) + Math.pow(averageLumaValue2, 2) + c1) * (sigsqx + sigsqy + c2);

      mssim += numerator / denominator;
      mcs += (2 * sigxy + c2) / (sigsqx + sigsqy + c2);
      numWindows++;
    }

    // calculate SSIM for each window
    _iterate(image1, image2, windowSize, luminance, iteration);
    return { ssim: mssim / numWindows, mcs: mcs / numWindows };
  };

  function _iterate(image1, image2, windowSize, luminance, callback) {
    var width = image1.width, height = image1.height;
    for (var y = 0; y < height; y += windowSize) {
      for (var x = 0; x < width; x += windowSize) {
        // avoid out-of-width/height
        var windowWidth = Math.min(windowSize, width - x), windowHeight = Math.min(windowSize, height - y);
        var lumaValues1 = _lumaValuesForWindow(image1, x, y, windowWidth, windowHeight, luminance);
        var lumaValues2 = _lumaValuesForWindow(image2, x, y, windowWidth, windowHeight, luminance);
        var averageLuma1 = _averageLuma(lumaValues1);
        var averageLuma2 = _averageLuma(lumaValues2);
        callback(lumaValues1, lumaValues2, averageLuma1, averageLuma2);
      }
    }
  }

  function _lumaValuesForWindow(image, x, y, width, height, luminance) {
    var array = image.data;
    var lumaValues = new Float32Array(new ArrayBuffer(width * height * 4));
    var counter = 0;
    var maxj = y + height;

    for (var j = y; j < maxj; j++) {
      var offset = j * image.width;
      var i = (offset + x) * image.channels;
      var maxi = (offset + x + width) * image.channels;

      switch (image.channels) {
      case 1 /* Grey */:
        while (i < maxi) {
          // (0.212655 +  0.715158 + 0.072187) === 1
          lumaValues[counter++] = array[i++];
        }
        break;
      case 2 /* GreyAlpha */:
        while (i < maxi) {
          lumaValues[counter++] = array[i++] * (array[i++] / 255);
        }
        break;
      case 3 /* RGB */:
        if (luminance) {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] * 0.212655 + array[i++] * 0.715158 + array[i++] * 0.072187);
          }
        }
        else {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] + array[i++] + array[i++]);
          }
        }
        break;
      case 4 /* RGBAlpha */:
        if (luminance) {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] * 0.212655 + array[i++] * 0.715158 + array[i++] * 0.072187) * (array[i++] / 255);
          }
        }
        else {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] + array[i++] + array[i++]) * (array[i++] / 255);
          }
        }
        break;
      }
    }
    return lumaValues;
  }

  function _averageLuma(lumaValues) {
    var sumLuma = 0.0;
    for (var i = 0; i < lumaValues.length; i++) {
      sumLuma += lumaValues[i];
    }
    return sumLuma / lumaValues.length;
  }

  self.calculateSSIM = function(imageFileA, imageFileB, outputFileName, callback) {
    self.loadImage(imageFileA, function(imageA) {
      self.loadImage(imageFileB, function(imageB) {
        self.generateDifference(imageA, imageB, outputFileName, function(difference) {
          var cmp = self.compare(imageA, imageB);
          callback({ ssim: cmp.ssim, mcs: cmp.mcs, mae: difference.mae, ae: difference.ae });
        });
      });
    });
  };
};

module.exports = new SSIM();