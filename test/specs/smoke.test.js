'use strict'

const fs = require('fs');
const path = require('path');
const ssim = require('../../index');

const OnshapeImagePath = path.resolve('test/data/onshape-logo.png');
const OnshapeUpsideDownImagePath = path.resolve('test/data/onshape-upside-down-log.png');
const OnshapeInvertedColorsImagePath = path.resolve('test/data/onshape-inverted-colors-logo.png');

const compareOpts = {};

test('Expect differences object does not have extra properties', (done) => {
  const expectedKeys = [ 'structuralSimilarityIndex',
    'meanCosineSimilarity',
    'meanAbsoluteErrors',
    'absoluteErrors',
    'squareErrors',
    'meanSquareErrors',
    'channelDistortion',
    'meanChannelDistortion',
    'meanChannelStandardDeviation' ];

  ssim.compare(OnshapeImagePath, OnshapeImagePath, compareOpts, (error, differences) => {
    expect(Object.keys(differences).sort()).toEqual(expectedKeys.sort());
    done();
  });
});

test('Compare image to itself', (done) => {
  ssim.compare(OnshapeImagePath, OnshapeImagePath, compareOpts, (error, differences) => {
    expect(differences.structuralSimilarityIndex).toBe(1);
    expect(differences.meanCosineSimilarity).toBe(1);
    expect(differences.meanAbsoluteErrors).toEqual([ 0, 0, 0, 0 ]);
    expect(differences.absoluteErrors).toEqual([ 0, 0, 0, 0 ]);
    expect(differences.squareErrors).toEqual([ 0, 0, 0, 0 ]);
    expect(differences.meanSquareErrors).toEqual([ 0, 0, 0, 0 ]);
    expect(differences.channelDistortion).toBe(0);
    expect(differences.meanChannelDistortion).toBe(0);
    expect(differences.meanChannelStandardDeviation).toBe(0);
    done();
  });
});

test('Compare image to inverted color version of itself', (done) => {
  ssim.compare(OnshapeImagePath, OnshapeInvertedColorsImagePath, compareOpts, (error, differences) => {
    expect(differences.structuralSimilarityIndex).toBe(-0.24187171551818);
    expect(differences.meanCosineSimilarity).toBe(0.2986129493925323);
    expect(differences.meanAbsoluteErrors).toEqual([ 251.66232222222223, 241.51173111111112, 212.61453333333333, 0 ]);
    expect(differences.absoluteErrors).toEqual([ 113248045, 108680279, 95676540, 0 ]);
    expect(differences.squareErrors).toEqual([ 28627256479, 26640646289, 23642994032, 0 ]);
    expect(differences.meanSquareErrors).toEqual([ 63616.12550888889, 59201.43619777778, 52539.98673777778, 0 ]);
    expect(differences.channelDistortion).toBe(450000);
    expect(differences.meanChannelDistortion).toBe(1);
    expect(differences.meanChannelStandardDeviation).toBe(5575.919067721537);
    done();
  });
});

test('Compare image to flipped version of itself', (done) => {
  ssim.compare(OnshapeImagePath, OnshapeUpsideDownImagePath, compareOpts, (error, differences) => {
    expect(differences.structuralSimilarityIndex).toBe(0.7646901842627868);
    expect(differences.meanCosineSimilarity).toBe(0.7697295253604732);
    expect(differences.meanAbsoluteErrors).toEqual([ 25.87649777777778, 21.89197777777778, 10.764795555555555, 0 ]);
    expect(differences.absoluteErrors).toEqual([ 11644424, 9851390, 4844158, 0 ]);
    expect(differences.squareErrors).toEqual([ 2778979292, 1996548418, 491042730, 0 ]);
    expect(differences.meanSquareErrors).toEqual([ 6175.509537777778, 4436.774262222222, 1091.2060666666666, 0 ]);
    expect(differences.channelDistortion).toBe(50565);
    expect(differences.meanChannelDistortion).toBe(0.11236666666666667);
    expect(differences.meanChannelStandardDeviation).toBe(2584.1236004987136);
    done();
  });
});
