'use strict';

const fs = require('fs');
const PNG = require('pngjs').PNG;

function ssimIterator(image1, image2, options, ssimValues) {
  const width = image1.width;
  const height = image1.height;

  for (let y = 0; y < height; y += options.windowSize) {
    for (let x = 0; x < width; x += options.windowSize) {
      const windowWidth = Math.min(options.windowSize, width - x);
      const windowHeight = Math.min(options.windowSize, height - y);

      const lumaValues1 = calculateLumaValuesForWindow(image1, x, y, windowWidth, windowHeight, options.useLuminance);
      const lumaValues2 = calculateLumaValuesForWindow(image2, x, y, windowWidth, windowHeight, options.useLuminance);

      const averageLuma1 = calculateAverageLuminance(lumaValues1);
      const averageLuma2 = calculateAverageLuminance(lumaValues2);

      ssimIteration(lumaValues1, lumaValues2, averageLuma1, averageLuma2, ssimValues);
    }
  }
}

function ssimIteration(lumaValues1, lumaValues2, averageLumaValue1, averageLumaValue2, ssimValues) {
  // Calculate variance and covariance
  let sigxy;
  let sigsqx;
  let sigsqy;
  sigxy = sigsqx = sigsqy = 0.0;

  for (let i = 0; i < lumaValues1.length; i++) {
    sigsqx += Math.pow((lumaValues1[i] - averageLumaValue1), 2);
    sigsqy += Math.pow((lumaValues2[i] - averageLumaValue2), 2);
    sigxy += (lumaValues1[i] - averageLumaValue1) * (lumaValues2[i] - averageLumaValue2);
  }

  const numPixelsInWin = lumaValues1.length - 1;

  sigsqx /= numPixelsInWin;
  sigsqy /= numPixelsInWin;
  sigxy /= numPixelsInWin;

  // Perform ssim calculation on window
  const numerator = (2 * averageLumaValue1 * averageLumaValue2 + ssimValues.c1) *
      (2 * sigxy + ssimValues.c2);
  const denominator = (Math.pow(averageLumaValue1, 2) + Math.pow(averageLumaValue2, 2) +
                     ssimValues.c1) * (sigsqx + sigsqy + ssimValues.c2);

  ssimValues.mssim += numerator / denominator;
  ssimValues.mcs += (2 * sigxy + ssimValues.c2) / (sigsqx + sigsqy + ssimValues.c2);
  ssimValues.numWindows++;
}

function calculateLumaValuesForWindow(image, x, y, width, height, luminance) {
  const array = image.data;
  const lumaValues = new Float32Array(new ArrayBuffer(width * height * 4));
  let counter = 0;
  const maxj = y + height;

  for (let j = y; j < maxj; j++) {
    const offset = j * image.width;
    let i = (offset + x) * image.channels;
    const maxi = (offset + x + width) * image.channels;

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
  return lumaValues.reduce((accumulator, current) => accumulator + current, 0) / lumaValues.length;
}

class SSIM {
  constructor(SSIMOptions = {}) {
    /**
     * @typedef {{
     *    windowSize: string|undefined
     *    K1: number|undefined
     *    K2: number|undefined
     *    useLuminance: boolean|undefined
     *    bitsPerComponent: number|undefined
     * }}
     */
    this.SSIMOptions = SSIMOptions;
  }

  async getImageDataFromFile (fileName) {
    return new Promise ((resolve, reject) => {
      fs.createReadStream(fileName)
        .pipe(new PNG())
        .on('parsed', function() {
          if (this.error) {
            reject(this.error);
          } else {
            resolve({
              data: this.data,
              width: this.width,
              height: this.height,
              channels: 4
            });
          }
        });
    });
  }

  calculateChannelDifferences (image1, image2, options) {
    const fuzz = options.fuzz || 32;

    const channels = image1.channels || 4;
    const totalSize = image1.height * image1.width * channels;
    const totalPixels = image1.height * image1.width;

    const differenceImage = (options.outputFileName && channels === 4) ? Buffer.alloc(totalSize) : null;

    const absoluteError = new Array(channels).fill(0);
    const squareError = new Array(channels).fill(0);
    const meanAbsoluteError = new Array(channels).fill(0);
    const meanSquareError = new Array(channels).fill(0);
    let differentPixels = 0;

    for (let offset = 0; offset < totalSize; offset += channels) {
      const distances = [ ];
      let match = true;

      // Calculate per channel differences
      for (let d = 0; d < channels; d++) {
        const pixelDistance = Math.abs(image2.data[offset + d] - image1.data[offset + d]);
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

      if (options.outputFileName && channels === 4) {
        // Show pixel differnces
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
    for (let t = 0; t < channels; t++) {
      meanAbsoluteError[t] = absoluteError[t] / totalPixels;
      meanSquareError[t] = squareError[t] / totalPixels;
    }

    // Calculate the standard deviation for mean channel differences (excluding alpha)
    let channelMean = 0;
    let channelMeanCount = 0;
    let variance = 0;
    let varianceCount = 0;
    let standardDeviation = 0;

    for (let m = 0; m < channels && m < 3; m++) {
      channelMean += meanSquareError[m];
      channelMeanCount++;
    }
    channelMean /= channelMeanCount;

    for (let v = 0 ; v < channels && v < 3; v++) {
      variance += Math.pow(meanSquareError[v] - channelMean, 2);
      varianceCount++;
    }
    variance /= (varianceCount - 1);
    standardDeviation = Math.sqrt(variance);

    // Package result
    const result = {
      ae: absoluteError,
      mae: meanAbsoluteError,
      se: squareError,
      mse: meanSquareError,
      cd: differentPixels,
      mcd: differentPixels / totalPixels,
      mcsd: standardDeviation
    };

    if (options.outputFileName) { // output the differnce image
      const png = new PNG();
      png.width = image1.width;
      png.height = image1.height;
      png.data = differenceImage;

      png.pack().pipe(fs.createWriteStream(options.outputFileName));
    }
    return result;
  }

  calculateSsim (image1, image2, options) {
    options = options || {};

    options.windowSize = options.windowSize || 64; // default 8 x 8 window size
    options.K1 = options.K1 || 0.01; // default k1 of 0.01
    options.K2 = options.K2 || 0.03; // default k2 of 0.03
    options.useLuminance = (options.useLuminance !== undefined) ? options.useLuminance : true;
    options.bitsPerComponent = options.bitsPerComponent || 8;

    const result = { ssim: 0, mcs: 0 };

    if (image1.width !== image2.width || image1.height !== image2.height) {
      return result;
    }

    const L = (1 << options.bitsPerComponent) - 1;
    const ssimValues = {
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
  }

  /**
   * Compare two images with options and result calculated differences
   * @param {string} imageFileA : name of the baseline image file
   * @param {string} imageFileB : name of the comparison image file
   * @param {SSIMOptions|undefined} options
   * @param callback
   */
  async compare (imageFileA, imageFileB, options, callback) {
    const imageA = this.getImageDataFromFile(imageFileA);
    const imageB = this.getImageDataFromFile(imageFileB);
    if (callback && {}.toString.call(callback) === '[object Function]') {
      callback(null, this.compareData(await imageA, await imageB, options));
    } else {
      return this.compareData(await imageA, await imageB, options);
    }
  }

  /**
   * Return comparison data of two images already converted
   * @param {string} imageA : baseline image
   * @param {string} imageB : compare image
   * @param {SSIMOptions|undefined} options
   */
  compareData (imageA, imageB, options) {
    if (typeof imageA === 'string') {
      imageA = new PNG.sync.read(Buffer.from(imageA, 'base64'));
    }
    if (typeof imageB === 'string') {
      imageB = new PNG.sync.read(Buffer.from(imageB, 'base64'));
    }

    const difference = this.calculateChannelDifferences(imageA, imageB, options);
    const ssim = this.calculateSsim(imageA, imageB);
    const totalDifferences = {
      structuralSimilarityIndex: ssim.ssim,
      meanCosineSimilarity: ssim.mcs,
      meanAbsoluteErrors: difference.mae,
      absoluteErrors: difference.ae,
      squareErrors: difference.se,
      meanSquareErrors: difference.mse,
      channelDistortion: difference.cd,
      meanChannelDistortion: difference.mcd,
      meanChannelStandardDeviation: difference.mcsd,
    };
    return totalDifferences;
  }
}

////////////////////////////////////////////////////////////

module.exports = new SSIM();
