// import process from 'node:process';
import fs from 'fs';
import os from 'os';
import scp from 'node-scp';
import dc from 'discord.js';
import _ from 'lodash';
import { Network } from 'neataptic';
import * as mathjs from 'mathjs';
import { wordsToNumbers } from 'words-to-numbers';
import { google } from 'googleapis';

// creates a string of time from milliseconds
function makeTimestamp(time : number = -1) : string {
    if (time < 0) time = Date.now();
    const tempTimes : number[] = [ time ];
    const times : string[] = [ ];
    const mods = [ 1000, 60, 60, 24, 7 ];
    for (let i = 0; i < mods.length; i++) {
        const thisTime = tempTimes[i] % mods[i];
        times.unshift(thisTime.toString().padStart(mods[i].toString().length, '0'));
        const nextTime = (tempTimes[i] - (thisTime)) / mods[i];
        if (nextTime <= 0) break;
        tempTimes[i] = thisTime
        tempTimes.push(nextTime);
    }
    return times.join(':');
}

function getDate() : string {
    const date = new Date();
    return `${date.toString().slice(16, 24)}:${date.getMilliseconds().toString().padStart(4, '0')}`;
}

const now1 = performance.now()
console.log(/^\d+$/.test("438296397452935169"))
console.log(performance.now() - now1)
const now2 = performance.now()
console.log(!isNaN(Number("438296397452935169")))
console.log(performance.now() - now2)
// console.log(/^\d+$/.test("12g45"))
// console.log(/^\d+$/.test("gggg"))