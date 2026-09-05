#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { url: null, screenshotDir: null, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--screenshot-dir') options.screenshotDir = argv[++i];
    else if (arg === '--headed') options.headed = true;
    else if (!options.url) options.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function close(actual, expected, tolerance = 0.01) {
  return Math.abs(actual - expected) <= tolerance;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) {
    console.log('Usage: rtk node scripts/test-selection-clipboard.js <url> [--headed] [--screenshot-dir DIR]');
    process.exitCode = 1;
    return;
  }
  if (options.screenshotDir) fs.mkdirSync(options.screenshotDir, { recursive: true });

  const browserErrors = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: !options.headed });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance && window.hotkeyManager, null, { timeout: 30000 });

    const setup = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.options.velocity = 0;
      pn.options.gravityWellMotion = 'static';
      pn.clearGravityWells();
      pn.o = pn.o.slice(0, 4);
      const particles = [
        { x: 150, y: 150, vx: 0.25, vy: -0.5, size: 3, hue: 25, color: '#ff8844' },
        { x: 300, y: 300, vx: -0.75, vy: 0.125, size: 5, hue: 210, color: '#4488ff' },
        { x: 700, y: 500, vx: 0, vy: 0, size: 2, hue: 90, color: '#88ff44' },
        { x: 1100, y: 650, vx: 0, vy: 0, size: 2, hue: 300, color: '#ff44cc' }
      ];
      particles.forEach((value, index) => {
        const particle = pn.o[index];
        particle.index = index;
        particle.x = value.x;
        particle.y = value.y;
        particle.velocity.x = value.vx;
        particle.velocity.y = value.vy;
        particle.size = value.size;
        particle.hue = value.hue;
        particle.particleColor = value.color;
      });
      pn._initSoAFromObjects(4);
      pn.initGrid();
      const selectedWell = pn.addGravityWell('black', 250, 250, 90);
      pn.updateGravityWell(selectedWell.id, {
        strength: 37,
        innerColor: '#ff5577',
        outerColor: '#6633ff'
      });
      const outsideWell = pn.addGravityWell('white', 800, 500, 120);
      pn.clearObjectSelection();
      return { selectedWellId: selectedWell.id, outsideWellId: outsideWell.id };
    });

    await page.keyboard.down('Control');
    await page.mouse.move(100, 100);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(400, 400, { steps: 4 });
    const marquee = await page.evaluate(() => {
      const pn = window.particleInstance;
      const element = document.querySelector('.particle-selection-marquee');
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        borderStyle: style.borderStyle,
        backgroundColor: style.backgroundColor,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        cursor: getComputedStyle(pn.canvas).cursor,
        forcesClear: !pn.attractionForce && !pn.repulsionForce,
        noWellDrag: !pn._gravityWellDrag,
        noCursorCapture: !pn._cursorCapturePending && !pn._cursorCaptureActive
      };
    });
    if (options.screenshotDir) {
      await page.screenshot({ path: path.join(options.screenshotDir, 'selection-marquee.png') });
    }
    await page.mouse.up({ button: 'left' });
    await page.keyboard.up('Control');
    await page.waitForFunction(() => {
      const overlay = document.querySelector('.particle-selection-overlay');
      return overlay && getComputedStyle(overlay).display === 'block';
    });

    const selected = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        particles: Array.from(pn.selectedParticleIndices),
        wells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        marqueeHidden: getComputedStyle(document.querySelector('.particle-selection-marquee')).display === 'none',
        selectionOverlayVisible: getComputedStyle(document.querySelector('.particle-selection-overlay')).display === 'block',
        cursorReset: getComputedStyle(pn.canvas).cursor !== 'crosshair'
      };
    });

    const groupDragStart = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.options.gravityWellsEnabled = false;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      return {
        particles: Array.from(pn.selectedParticleIndices, index => ({
          index,
          x: pn.posX[index],
          y: pn.posY[index]
        })),
        wells: Array.from(pn.selectedGravityWellIds, id => {
          const well = pn.getGravityWell(id);
          return { id, x: well.x, y: well.y };
        })
      };
    });
    const dragDelta = { x: 60, y: 40 };
    await page.mouse.move(groupDragStart.particles[0].x, groupDragStart.particles[0].y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(
      groupDragStart.particles[0].x + dragDelta.x,
      groupDragStart.particles[0].y + dragDelta.y,
      { steps: 3 }
    );
    const groupDragging = await page.evaluate(({ start, delta }) => {
      const pn = window.particleInstance;
      return {
        dragActive: !!pn._objectSelectionDrag,
        cursor: getComputedStyle(pn.canvas).cursor,
        forcesClear: !pn.attractionForce && !pn.repulsionForce,
        particles: start.particles.map(source => ({
          x: pn.posX[source.index],
          y: pn.posY[source.index],
          expectedX: source.x + delta.x,
          expectedY: source.y + delta.y
        })),
        wells: start.wells.map(source => {
          const well = pn.getGravityWell(source.id);
          return {
            x: well.x,
            y: well.y,
            expectedX: source.x + delta.x,
            expectedY: source.y + delta.y
          };
        }),
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds)
      };
    }, { start: groupDragStart, delta: dragDelta });
    await page.mouse.up({ button: 'left' });
    const groupDragReleased = await page.evaluate(() => {
      const pn = window.particleInstance;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      window.__selectionTestEnsureLoop = pn._ensureAnimationLoop;
      pn._ensureAnimationLoop = function() {};
      return {
        dragStopped: !pn._objectSelectionDrag,
        classCleared: !pn.canvas.classList.contains('object-selection-dragging')
      };
    });

    const paneBeforeCopy = await page.evaluate(() => {
      const container = document.getElementById('tp-container');
      return !container || getComputedStyle(container).display === 'none';
    });
    await page.keyboard.press('Control+c');
    const copied = await page.evaluate(() => {
      const pn = window.particleInstance;
      const clipboard = pn._selectionClipboard;
      const container = document.getElementById('tp-container');
      return {
        particles: clipboard?.particles.length,
        wells: clipboard?.wells.length,
        anchorX: clipboard?.anchorX,
        anchorY: clipboard?.anchorY,
        paneStillHidden: !container || getComputedStyle(container).display === 'none',
        snapshot: clipboard ? JSON.parse(JSON.stringify(clipboard)) : null
      };
    });

    const destination = { x: 900, y: 300 };
    await page.mouse.move(destination.x, destination.y);
    await page.keyboard.press('Control+v');
    const pasted = await page.evaluate(({ setup, destination }) => {
      const pn = window.particleInstance;
      const clipboard = pn._selectionClipboard;
      const start = 4;
      const copiedParticles = clipboard.particles.map((snapshot, offset) => {
        const index = start + offset;
        const particle = pn.o[index];
        return {
          index,
          x: pn.posX[index],
          y: pn.posY[index],
          vx: pn.velX[index],
          vy: pn.velY[index],
          size: pn.sizeA[index],
          objectSize: particle.size,
          hue: particle.hue,
          particleColor: particle.particleColor,
          expectedX: snapshot.x + destination.x - clipboard.anchorX,
          expectedY: snapshot.y + destination.y - clipboard.anchorY,
          expectedVx: snapshot.velocityX,
          expectedVy: snapshot.velocityY,
          expectedHue: snapshot.hue,
          expectedParticleColor: snapshot.particleColor
        };
      });
      const pastedWell = pn.gravityWells.find(well =>
        well.id !== setup.selectedWellId && well.id !== setup.outsideWellId
      );
      return {
        particleCount: pn.numParticles,
        objectCount: pn.o.length,
        wellCount: pn.gravityWells.length,
        particles: copiedParticles,
        well: pastedWell ? { ...pastedWell } : null,
        expectedWell: {
          x: clipboard.wells[0].x + destination.x - clipboard.anchorX,
          y: clipboard.wells[0].y + destination.y - clipboard.anchorY,
          source: clipboard.wells[0]
        },
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        typedArrayCapacity: pn.posX.length
      };
    }, { setup, destination });

    const edgePaste = await page.evaluate(() => {
      const pn = window.particleInstance;
      const clipboard = pn._selectionClipboard;
      const particleStart = pn.numParticles;
      const knownWellIds = new Set(pn.gravityWells.map(well => well.id));
      pn._gravityPointer = { x: 1, y: 1 };
      pn.pasteObjectSelection();
      const particles = clipboard.particles.map((snapshot, offset) => ({
        sourceX: snapshot.x,
        sourceY: snapshot.y,
        x: pn.posX[particleStart + offset],
        y: pn.posY[particleStart + offset]
      }));
      const well = pn.gravityWells.find(candidate => !knownWellIds.has(candidate.id));
      const points = [...particles.map(particle => ({ x: particle.x, y: particle.y })), { x: well.x, y: well.y }];
      const sourcePoints = [...clipboard.particles.map(particle => ({ x: particle.x, y: particle.y })), clipboard.wells[0]];
      return {
        allCentersVisible: points.every(point => point.x >= 0 && point.x <= pn.i.size.width && point.y >= 0 && point.y <= pn.i.size.height),
        sourceDeltas: sourcePoints.slice(1).map(point => ({
          x: point.x - sourcePoints[0].x,
          y: point.y - sourcePoints[0].y
        })),
        pastedDeltas: points.slice(1).map(point => ({
          x: point.x - points[0].x,
          y: point.y - points[0].y
        }))
      };
    });

    await page.evaluate(() => {
      const pn = window.particleInstance;
      pn._ensureAnimationLoop = window.__selectionTestEnsureLoop;
      delete window.__selectionTestEnsureLoop;
      pn.options.gravityWellsEnabled = true;
      pn._ensureAnimationLoop();
    });

    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -1);
    await page.keyboard.press('Control+c');
    const singleWellCopy = await page.evaluate(expectedId => {
      const pn = window.particleInstance;
      return {
        primary: pn.selectedGravityWellId,
        selectedWells: Array.from(pn.selectedGravityWellIds),
        selectedParticles: Array.from(pn.selectedParticleIndices),
        copiedWells: pn._selectionClipboard.wells.map(well => well.id),
        copiedParticles: pn._selectionClipboard.particles.length,
        expectedId
      };
    }, setup.outsideWellId);

    await page.setViewportSize({ width: 1270, height: 710 });
    await page.waitForFunction(() => {
      const pn = window.particleInstance;
      return pn.i.size.width === 1270 && pn.i.size.height === 710 && pn.o.includes(pn.p);
    });
    await page.keyboard.press('Control+a');
    const selectAll = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        particleCount: pn.numParticles,
        wellCount: pn.gravityWells.length,
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        gatherInactive: !pn._gatherActive
      };
    });
    await page.keyboard.press('Delete');
    const deleted = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        particleCount: pn.numParticles,
        objectCount: pn.o.length,
        wellCount: pn.gravityWells.length,
        typedArrayLengths: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length],
        pointerIndex: pn.p.index,
        pointerExcludedFromObjects: !pn.o.includes(pn.p),
        selectionClear: !pn.selectedParticleIndices.size && !pn.selectedGravityWellIds.size && !pn.selectedGravityWellId,
        overlayHidden: getComputedStyle(document.querySelector('.particle-selection-overlay')).display === 'none'
      };
    });

    const partialDeleteSetup = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.setParticleCount(3);
      pn.o.forEach((particle, index) => {
        particle.index = index;
        particle.hue = 100 + index;
      });
      pn._initSoAFromObjects(3);
      pn.clearGravityWells();
      const removedWell = pn.addGravityWell('black', 200, 200, 60);
      const keptWell = pn.addGravityWell('white', 900, 500, 70);
      pn.selectedParticleIndices = new Set([0, 2]);
      pn.selectedGravityWellIds = new Set([removedWell.id]);
      pn.selectedGravityWellId = removedWell.id;
      return { keptParticleHue: pn.o[1].hue, keptWellId: keptWell.id };
    });
    await page.keyboard.press('Delete');
    const partialDelete = await page.evaluate(expected => {
      const pn = window.particleInstance;
      return {
        particleCount: pn.numParticles,
        survivorReindexed: pn.o.length === 1 && pn.o[0].index === 0 && pn.o[0].hue === expected.keptParticleHue,
        typedArrayLengths: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length],
        wells: pn.gravityWells.map(well => well.id),
        expectedWellId: expected.keptWellId,
        selectionClear: !pn.selectedParticleIndices.size && !pn.selectedGravityWellIds.size && !pn.selectedGravityWellId
      };
    }, partialDeleteSetup);

    await page.keyboard.press('Escape');
    const escaped = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        selectionClear: !pn.selectedParticleIndices.size && !pn.selectedGravityWellIds.size && !pn.selectedGravityWellId,
        overlayHidden: getComputedStyle(document.querySelector('.particle-selection-overlay')).display === 'none'
      };
    });
    const emptyCopy = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented };
    });

    const copiedPoints = copied.snapshot ? [
      ...copied.snapshot.particles.map(particle => ({ x: particle.x, y: particle.y })),
      ...copied.snapshot.wells.map(well => ({ x: well.x, y: well.y }))
    ] : [];
    const copiedBounds = copiedPoints.length ? {
      left: Math.min(...copiedPoints.map(point => point.x)),
      right: Math.max(...copiedPoints.map(point => point.x)),
      top: Math.min(...copiedPoints.map(point => point.y)),
      bottom: Math.max(...copiedPoints.map(point => point.y))
    } : null;

    const assertions = {
      marqueeMatchesDesktopSelection: marquee.display === 'block' && marquee.borderStyle === 'dashed' &&
        marquee.backgroundColor !== 'rgba(0, 0, 0, 0)' && close(marquee.left, 100) && close(marquee.top, 100) &&
        close(marquee.width, 300, 2) && close(marquee.height, 300, 2) && marquee.cursor === 'crosshair',
      marqueeSuppressesOtherGestures: marquee.forcesClear && marquee.noWellDrag && marquee.noCursorCapture,
      selectsParticlesAndWellsByCenter: selected.particles.join(',') === '0,1' &&
        selected.wells.length === 1 && selected.wells[0] === setup.selectedWellId &&
        selected.primaryWell === setup.selectedWellId,
      marqueeCleansUpOnRelease: selected.marqueeHidden && selected.selectionOverlayVisible && selected.cursorReset,
      dragsMixedSelectionAsOneGroup: groupDragging.dragActive && groupDragging.cursor === 'grabbing' &&
        groupDragging.forcesClear &&
        groupDragging.particles.every(particle => close(particle.x, particle.expectedX) && close(particle.y, particle.expectedY)) &&
        groupDragging.wells.every(well => close(well.x, well.expectedX) && close(well.y, well.expectedY)) &&
        groupDragging.selectedParticles.join(',') === selected.particles.join(',') &&
        groupDragging.selectedWells.join(',') === selected.wells.join(',') &&
        groupDragReleased.dragStopped && groupDragReleased.classCleared,
      ctrlCCopiesWithoutOpeningControls: paneBeforeCopy && copied.paneStillHidden &&
        copied.particles === 2 && copied.wells === 1 && copiedBounds &&
        close(copied.anchorX, (copiedBounds.left + copiedBounds.right) / 2) &&
        close(copied.anchorY, (copiedBounds.top + copiedBounds.bottom) / 2),
      ctrlVPastesExactParticles: pasted.particleCount === 6 && pasted.objectCount === 6 &&
        pasted.typedArrayCapacity >= 6 && pasted.particles.every(particle =>
          close(particle.x, particle.expectedX) && close(particle.y, particle.expectedY) &&
          close(particle.vx, particle.expectedVx) && close(particle.vy, particle.expectedVy) &&
          particle.size === particle.objectSize && particle.hue === particle.expectedHue &&
          particle.particleColor === particle.expectedParticleColor),
      ctrlVPastesExactWell: pasted.wellCount === 3 && pasted.well &&
        pasted.well.id !== pasted.expectedWell.source.id && pasted.well.type === pasted.expectedWell.source.type &&
        close(pasted.well.x, pasted.expectedWell.x) && close(pasted.well.y, pasted.expectedWell.y) &&
        pasted.well.radius === pasted.expectedWell.source.radius && pasted.well.strength === pasted.expectedWell.source.strength &&
        pasted.well.innerColor === pasted.expectedWell.source.innerColor && pasted.well.outerColor === pasted.expectedWell.source.outerColor,
      pastedObjectsBecomeSelection: pasted.selectedParticles.join(',') === '4,5' && pasted.selectedWells.length === 1 &&
        pasted.selectedWells[0] === pasted.well.id && pasted.primaryWell === pasted.well.id,
      edgePasteKeepsGroupTogether: edgePaste.allCentersVisible && edgePaste.sourceDeltas.every((delta, index) =>
        close(delta.x, edgePaste.pastedDeltas[index].x) && close(delta.y, edgePaste.pastedDeltas[index].y)),
      singleWellActionCollapsesMarqueeSelection: singleWellCopy.primary === singleWellCopy.expectedId &&
        singleWellCopy.selectedWells.join(',') === singleWellCopy.expectedId && !singleWellCopy.selectedParticles.length &&
        singleWellCopy.copiedWells.join(',') === singleWellCopy.expectedId && singleWellCopy.copiedParticles === 0,
      ctrlASelectsEveryObjectWithoutGathering: selectAll.gatherInactive &&
        selectAll.selectedParticles.length === selectAll.particleCount &&
        selectAll.selectedWells.length === selectAll.wellCount &&
        selectAll.selectedParticles.every((index, position) => index === position) &&
        selectAll.selectedWells.includes(selectAll.primaryWell),
      deleteRemovesEntireSelection: deleted.particleCount === 0 && deleted.objectCount === 0 &&
        deleted.wellCount === 0 && deleted.typedArrayLengths.every(length => length === 0) &&
        deleted.pointerIndex === 0 && deleted.pointerExcludedFromObjects && deleted.selectionClear && deleted.overlayHidden,
      deletePreservesAndReindexesUnselectedObjects: partialDelete.particleCount === 1 &&
        partialDelete.survivorReindexed && partialDelete.typedArrayLengths.every(length => length === 1) &&
        partialDelete.wells.join(',') === partialDelete.expectedWellId && partialDelete.selectionClear,
      escapeClearsSelection: escaped.selectionClear && escaped.overlayHidden,
      emptyCtrlCPreservesNativeCopy: !emptyCopy.defaultPrevented,
      noBrowserErrors: browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      assertions,
      browserErrors,
      marquee,
      selected,
      groupDragging,
      groupDragReleased,
      copied,
      pasted,
      edgePaste,
      singleWellCopy,
      selectAll,
      deleted,
      partialDelete,
      emptyCopy
    };
    console.log(JSON.stringify(result));
    if (!result.passed) process.exitCode = 2;
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
