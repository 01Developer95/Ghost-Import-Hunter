import * as fs from 'fs';
import { someFakeMember } from 'chalk';
import type { FakeType } from 'ora';
import NotDefault from 'ts-node'; // ts-node doesn't have a default export? Or maybe commander doesn't.
import defaultCommander from 'commander';

require('fake-module-xyz');
import('another-fake-xyz');

const a = 'test';
