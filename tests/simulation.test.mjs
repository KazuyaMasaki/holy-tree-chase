import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, SAMPLE_ROSTER } from '../src/roster.js';
import { MarbleSimulation } from '../src/simulation.js';
import { TRACK_LENGTH, FUNNEL } from '../src/track.js';

test('parseRoster parses spreadsheet tabs/newlines, trims whitespace, and rejects invalid inputs', () => {
  const ok = parseRoster('  佐藤 太郎 \n\n\t 鈴木花子\r\n田中  一郎 ');
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.names, ['佐藤 太郎', '鈴木花子', '田中 一郎']);

  const dup = parseRoster('Alice\nBob\nalice');
  assert.equal(dup.valid, false);
  assert.ok(dup.errors.some((e) => e.includes('重複')));

  const tooFew = parseRoster('OnlyOne');
  assert.equal(tooFew.valid, false);

  const twentyOne = Array.from({ length: 21 }, (_, i) => `Member${i + 1}`).join('\n');
  assert.equal(parseRoster(twentyOne).valid, false);

  const twenty = Array.from({ length: 20 }, (_, i) => `Member${i + 1}`).join('\n');
  assert.equal(parseRoster(twenty).valid, true);
});

test('track length and funnel geometry are well-formed', () => {
  assert.ok(TRACK_LENGTH > 110 && TRACK_LENGTH < 180, `unexpected TRACK_LENGTH=${TRACK_LENGTH}`);
  assert.ok(FUNNEL.rimRadius > FUNNEL.holeRadius * 3);
});

function runRace(names, seed, onStep) {
  const sim = new MarbleSimulation(names, { seed, countdownSeconds: 0.1 });
  const dt = 1 / 60;
  let steps = 0;
  while (sim.phase !== 'finished' && steps < 60 * 60) {
    sim.step(dt);
    onStep?.(sim);
    steps += 1;
  }
  return sim;
}

test('races with 2, 8, and 20 participants always finish within target duration without NaN', () => {
  for (const count of [2, 8, 20]) {
    const names = Array.from({ length: count }, (_, i) => `Player-${i + 1}`);
    for (let trial = 0; trial < 5; trial++) {
      const sim = runRace(names, 1000 + count * 31 + trial * 17);
      assert.equal(sim.phase, 'finished', `count=${count} trial=${trial} did not finish`);
      assert.ok(sim.winner, 'winner should be set');
      assert.ok(
        sim.realElapsed >= 14 && sim.realElapsed <= 40,
        `count=${count} trial=${trial} duration=${sim.realElapsed.toFixed(2)}s out of target bounds`
      );
      for (const m of sim.marbles) {
        assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z), 'finite marble coords');
      }
    }
  }
});

test('sample 8-player races exhibit lead changes and fair winner distribution across seeds', () => {
  const winCounts = new Map(SAMPLE_ROSTER.map((n) => [n, 0]));
  let totalElapsed = 0;
  let totalLeadChanges = 0;
  const trials = 40;

  for (let i = 0; i < trials; i++) {
    const sim = runRace(SAMPLE_ROSTER, 7777 + i * 97);
    assert.equal(sim.phase, 'finished');
    winCounts.set(sim.winner.name, (winCounts.get(sim.winner.name) || 0) + 1);
    totalElapsed += sim.realElapsed;
    totalLeadChanges += sim.leadChanges;
  }

  const avgElapsed = totalElapsed / trials;
  const uniqueWinners = [...winCounts.values()].filter((c) => c > 0).length;
  console.log(`40-race benchmark (8p): avg=${avgElapsed.toFixed(2)}s, avgLeadChanges=${(totalLeadChanges / trials).toFixed(1)}, uniqueWinners=${uniqueWinners}/8`);

  assert.ok(avgElapsed >= 18 && avgElapsed <= 34, `avgElapsed=${avgElapsed.toFixed(2)}s`);
  assert.ok(uniqueWinners >= 6, `expected fair spread of winners, got ${uniqueWinners}/8`);
  assert.ok(totalLeadChanges / trials >= 2.0, 'expected exciting lead changes');
});

test('tailwinds give trailing marbles a real chance without making the comeback automatic', () => {
  let comebackWins = 0;
  let leaderWins = 0;
  const trials = 64;
  for (let i = 0; i < trials; i++) {
    let midwayOrder;
    const gusts = [];
    const sim = runRace(SAMPLE_ROSTER, 16381 + i * 103, current => {
      const leader = current.marbles[current.rankings[0]];
      if (!midwayOrder && leader.progress >= .5) midwayOrder = current.rankings.slice();
      for (const event of current.drainEvents()) {
        if (event.type !== 'tailwind') continue;
        gusts.push(leader.progress);
        assert(!event.riders.includes(leader.id));
        for (const id of event.riders) {
          const rider = current.marbles[id];
          assert.equal(rider.stage, 'track');
          assert(leader.s > rider.s && rider.windRemaining > 0);
          assert.equal(rider.windStartRank, rider.rank);
        }
      }
    });
    assert.equal(sim.phase, 'finished');
    assert.equal(gusts.length, 2);
    assert(gusts[0] >= .47 && gusts[0] < .49);
    assert(gusts[1] >= .78 && gusts[1] < .80);
    const midwayRank = midwayOrder.indexOf(sim.winner.id) + 1;
    if (midwayRank > 4) comebackWins++;
    if (midwayRank === 1) leaderWins++;
  }
  assert(comebackWins >= trials * .20 && comebackWins <= trials * .60,
    `midway bottom-half winners: ${comebackWins}/${trials}`);
  assert(leaderWins >= 3, 'a midway leader can still win');
});

test('a close photo finish announces the first crossing once in either array order', () => {
  for (const first of [0, 1]) {
    const sim = new MarbleSimulation(['A', 'B'], {seed: 107});
    sim.phase = 'racing';
    for (const m of sim.marbles) {
      m.stage = 'funnel';
      m.x = FUNNEL.cx + FUNNEL.holeRadius + (m.id === first ? .001 : .007);
      m.z = FUNNEL.cz;
      m.vx = -5;
      m.vz = 0;
    }
    sim.step(1/60);
    assert.equal(sim.winner.id, first);
    assert.deepEqual(sim.drainEvents().filter(e => e.type === 'winner').map(e => e.marbleId), [first]);
  }
});
