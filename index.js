'use strict';

var fs = require('fs');
var PNG = require('pngjs').PNG;

function SSIM() {
  var self = this;

  ////////////////////////////////////////////////////////////

  function ssimIterator(image1, image2, options, ssimValues) {
    var width = image1.width;
    var height = image1.height;

    for (var y = 0; y < height; y += options.windowSize) {
      for (var x = 0; x < width; x += options.windowSize) {
        var windowWidth = Math.min(options.windowSize, width - x);
        var windowHeight = Math.min(options.windowSize, height - y);

        var lumaValues1 = calculateLumaValuesForWindow(image1, x, y, windowWidth, windowHeight, options.useLuminance);
        var lumaValues2 = calculateLumaValuesForWindow(image2, x, y, windowWidth, windowHeight, options.useLuminance);

        var averageLuma1 = calculateAverageLuminance(lumaValues1);
        var averageLuma2 = calculateAverageLuminance(lumaValues2);

        ssimIteration(lumaValues1, lumaValues2, averageLuma1, averageLuma2, ssimValues);
      }
    }
  }

  function ssimIteration(lumaValues1, lumaValues2, averageLumaValue1, averageLumaValue2, ssimValues) {
    // Calculate variance and covariance
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

    // Perform ssim calculation on window
    var numerator = (2 * averageLumaValue1 * averageLumaValue2 + ssimValues.c1) *
        (2 * sigxy + ssimValues.c2);
    var denominator = (Math.pow(averageLumaValue1, 2) + Math.pow(averageLumaValue2, 2) +
                       ssimValues.c1) * (sigsqx + sigsqy + ssimValues.c2);

    ssimValues.mssim += numerator / denominator;
    ssimValues.mcs += (2 * sigxy + ssimValues.c2) / (sigsqx + sigsqy + ssimValues.c2);
    ssimValues.numWindows++;
  }

  function calculateLumaValuesForWindow(image, x, y, width, height, luminance) {
    var array = image.data;
    var lumaValues = new Float32Array(new ArrayBuffer(width * height * 4));
    var counter = 0;
    var maxj = y + height;

    for (var j = y; j < maxj; j++) {
      var offset = j * image.width;
      var i = (offset + x) * image.channels;
      var maxi = (offset + x + width) * image.channels;

      switch (image.channels) {
      case 1: /* Grey */
        while (i < maxi) {
          // (0.212655 +  0.715158 + 0.072187) === 1
          lumaValues[counter++] = array[i++];
        }
        break;
      case 2: /* GreyAlpha */
        while (i < maxi) {
          lumaValues[counter++] = array[i++] * (array[i++] / 255);
        }
        break;
      case 3: /* RGB */
        if (luminance) {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] * 0.212655 + array[i++] * 0.715158 + array[i++] * 0.072187);
          }
        } else {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] + array[i++] + array[i++]);
          }
        }
        break;
      case 4: /* RGBAlpha */
        if (luminance) {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] * 0.212655 + array[i++] * 0.715158 + array[i++] * 0.072187) * (array[i++] / 255);
          }
        } else {
          while (i < maxi) {
            lumaValues[counter++] = (array[i++] + array[i++] + array[i++]) * (array[i++] / 255);
          }
        }
        break;
      }
    }
    return lumaValues;
  }

  function calculateAverageLuminance(lumaValues) {
    var sumLuma = 0.0;
    for (var i = 0; i < lumaValues.length; i++) {
      sumLuma += lumaValues[i];
    }
    return sumLuma / lumaValues.length;
  }

  ////////////////////////////////////////////////////////////

  self.loadImageFromFile = function(fileName, callback) {
    fs.createReadStream(fileName).pipe(new PNG()).on('parsed', function () {
      callback({
        data: this.data,
        width: this.width,
        height: this.height,
        channels: 4
      });
    });
  };

  self.calculateChannelDifferences = function(image1, image2, options, callback) {
    var fuzz = (options.fuzz !== undefined) ? options.fuzz : 32;

    var totalSize = image1.height * image1.width * 4;
    var totalPixels = image1.height * image1.width;
    var channels = image1.channels;

    var differenceImage = (options.outputFileName && channels === 4) ? new Buffer(totalSize) : null;

    var absoluteError = [];
    var squareError = [];
    var meanAbsoluteError = [];
    var meanSquareError = [];
    var differentPixels = 0;

    for (var c = 0; c < channels; c++) {
      absoluteError[c] = 0;
      squareError[c] = 0;
      meanAbsoluteError[c] = 0;
      meanSquareError[c] = 0;
    }

    for(var offset = 0; offset < totalSize; offset += channels) {
      var distances = [ ];
      var match = true;

      // Calculate per channel differences
      for (var d = 0; d < channels; d++) {
        var pixelDistance = Math.abs(image2.data[offset + d] - image1.data[offset + d]);
        distances.push(pixelDistance);
        if (pixelDistance > fuzz) {
          match = false;
          absoluteError[d] += pixelDistance;
          squareError[d] += Math.pow(pixelDistance, 2);
        }
      }

      if (!match) {
        differentPixels++;
      }

      if(options.outputFileName && channels === 4) {
        // SHow pixel differnces
        if (match) {
          differenceImage[offset] = image1.data[offset];
          differenceImage[offset + 1] = image1.data[offset + 1];
          differenceImage[offset + 2] = image1.data[offset + 2];
          differenceImage[offset + 3] = 100; // Slightly transparent
        } else {
          differenceImage[offset] = 255; // Red
          differenceImage[offset + 1] = 0;
          differenceImage[offset + 2] = 0;
          differenceImage[offset + 3] = 255;
        }
      }
    }

    // Calculate mean errors
    for(var t = 0; t < channels; t++) {
      meanAbsoluteError[t] = absoluteError[t] / totalPixels;
      meanSquareError[t] = squareError[t] / totalPixels;
    }

    // Calculate the standard deviation for mean channel differences (excluding alpha)
    var channelMean = 0;
    var channelMeanCount = 0;
    var variance = 0;
    var varianceCount = 0;
    var standardDeviation = 0;

    for(var m = 0; m < channels && m < 3; m++) {
      channelMean += meanSquareError[m];
      channelMeanCount++;
    }
    channelMean /= channelMeanCount;

    for(var v = 0 ; v < channels && v < 3; v++) {
      variance += Math.pow(meanSquareError[v] - channelMean, 2);
      varianceCount++;
    }
    variance /= (varianceCount - 1);
    standardDeviation = Math.sqrt(variance);

    // Package result
    var result = {
      ae: absoluteError,
      mae: meanAbsoluteError,
      se: squareError,
      mse: meanSquareError,
      cd: differentPixels,
      mcd: differentPixels / totalPixels,
      mcsd: standardDeviation
    };

    if (options.outputFileName) { // output the differnce image
      var png = new PNG();
      png.width = image1.width;
      png.height = image1.height;
      png.data = differenceImage;

      png.pack().pipe(fs.createWriteStream(options.outputFileName)).on('close', function() {
        callback(result);
      });
    } else {
      callback(result);
    }
  };

  self.calculateSsim = function(image1, image2, options) {
    options = options || {};

    options.windowSize = options.windowSize || 64; // default 8 x 8 window size
    options.K1 = options.K1 || 0.01; // default k1 of 0.01
    options.K2 = options.K2 || 0.03; // default k2 of 0.03
    options.useLuminance = (options.useLuminance !== undefined) ? options.useLuminance : true;
    options.bitsPerComponent = options.bitsPerComponent || 8;

    var result = { ssim: 0, mcs: 0 };

    if (image1.width !== image2.width || image1.height !== image2.height) {
      return result;
    }

    var L = (1 << options.bitsPerComponent) - 1;
    var ssimValues = {
      c1: Math.pow((options.K1 * L), 2),
      c2: Math.pow((options.K2 * L), 2),
      numWindows: 0,
      mssim: 0.0,
      mcs: 0.0
    };

    // calculate SSIM for each window
    ssimIterator(image1, image2, options, ssimValues);

    result.ssim = ssimValues.mssim / ssimValues.numWindows;
    result.mcs = ssimValues.mcs / ssimValues.numWindows;
    return result;
  };

  /**
   * @typedef {{
   *    windowSize: string|undefined
   *    K1: number|undefined
   *    K2: number|undefined
   *    useLuminance: boolean|undefined
   *    bitsPerComponent: number|undefined
   * }}
   */
  var SSIMOptions;

  /**
   * Compare two images with options and result calculated differences
   * @param {string} imageFileA : name of the baseline image file
   * @param {string} imageFileB : name of the comparison image file
   * @param {SSIMOptions|undefined} options
   * @param callback
   */
  self.compare = function(imageFileA, imageFileB, options, callback) {
    try {
      self.loadImageFromFile(imageFileA, function(imageA) {
        self.loadImageFromFile(imageFileB, function(imageB) {
          self.compareData(imageA, imageB, options, callback);
        });
      });
    } catch (error) {
      callback(error);
    }
  };

  /**
   * Compare two image strings with options and result calculated differences
   * @param {string} imageA : baseline image
   * @param {string} imageB : compare image
   * @param {SSIMOptions|undefined} options
   * @param callback
   */
  self.compareData = function(imageA, imageB, options, callback) {
    self.calculateChannelDifferences(imageA, imageB, options, function(difference) {
      var ssim = self.calculateSsim(imageA, imageB);
      var totalDifferences = {
        structuralSimilarityIndex: ssim.ssim,
        meanCosineSimilarity: ssim.mcs,
        meanAbsoluteErrors: difference.mae,
        absoluteErrors: difference.ae,
        squareErrors: difference.se,
        meanSquareErrors: difference.mse,
        channelDistortion: difference.cd,
        meanChannelDistortion: difference.mcd,
        meanChannelStandardDeviation: difference.mcsd
      };
      callback(null, totalDifferences);
    });
  };
};

////////////////////////////////////////////////////////////

module.exports = new SSIM();