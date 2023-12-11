// import process from 'node:process';
import fs from 'fs';
import os from 'os';
import scp from 'node-scp';
import dc from 'discord.js';
import _ from 'underscore';
import { Network } from 'neataptic';
import * as mathjs from 'mathjs';
import { wordsToNumbers } from 'words-to-numbers';
import { google } from 'googleapis';

var network = new Network(2,1);

var trainingSet = [
    { input: [0,0], output: [0] },
    { input: [0,1], output: [1] },
    { input: [1,0], output: [1] },
    { input: [1,1], output: [0] }
];

await network.evolve(trainingSet, {
    equal: true,
    error: 0.03
});