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

    await page.evaluate(() => {
      const manager = window.hotkeyManager;
      window.__selectionToastMessages = [];
      window.__selectionTestShowToast = manager.showToast;
      manager.showToast = function(message, options) {
        window.__selectionToastMessages.push(message);
        return window.__selectionTestShowToast.call(this, message, options);
      };
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
        toast: window.__selectionToastMessages.at(-1),
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
        particleSources: clipboard?.particleSources?.length,
        wellSourceIds: clipboard?.wellSourceIds?.slice(),
        paneStillHidden: !container || getComputedStyle(container).display === 'none',
        snapshot: clipboard ? {
          particles: clipboard.particles.map(particle => ({ ...particle })),
          wells: clipboard.wells.map(well => ({ ...well }))
        } : null
      };
    });

    const firstLiveSources = await page.evaluate(selectedWellId => {
      const pn = window.particleInstance;
      const particles = [
        { x: 520, y: 180, velocityX: 1.25, velocityY: -1.5, size: 6, hue: 45, particleColor: '#aa5500' },
        { x: 710, y: 360, velocityX: -2.25, velocityY: 0.75, size: 4, hue: 275, particleColor: '#0055aa' }
      ];
      particles.forEach((value, index) => {
        const particle = pn.o[index];
        particle.x = value.x;
        particle.y = value.y;
        particle.velocity.x = value.velocityX;
        particle.velocity.y = value.velocityY;
        particle.size = value.size;
        particle.hue = value.hue;
        particle.particleColor = value.particleColor;
        pn.posX[index] = value.x;
        pn.posY[index] = value.y;
        pn.velX[index] = value.velocityX;
        pn.velY[index] = value.velocityY;
        pn.sizeA[index] = value.size;
      });
      const well = pn.getGravityWell(selectedWellId);
      Object.assign(well, {
        type: 'white',
        x: 610,
        y: 270,
        strength: -41,
        radius: 135,
        innerColor: '#11cc88',
        outerColor: '#4422ee'
      });
      return {
        particles,
        well: { ...well },
        knownWellIds: pn.gravityWells.map(candidate => candidate.id)
      };
    }, setup.selectedWellId);
    const firstPointer = { x: 1000, y: 100 };
    await page.mouse.move(firstPointer.x, firstPointer.y);
    await page.keyboard.press('Control+v');
    const firstPaste = await page.evaluate(({ expected, firstPointer }) => {
      const pn = window.particleInstance;
      const start = 4;
      const sourcePoints = [...expected.particles, expected.well];
      const anchorX = (Math.min(...sourcePoints.map(point => point.x)) + Math.max(...sourcePoints.map(point => point.x))) / 2;
      const anchorY = (Math.min(...sourcePoints.map(point => point.y)) + Math.max(...sourcePoints.map(point => point.y))) / 2;
      const shiftX = firstPointer.x - anchorX;
      const shiftY = firstPointer.y - anchorY;
      const particles = expected.particles.map((source, offset) => {
        const index = start + offset;
        const particle = pn.o[index];
        return {
          index,
          x: pn.posX[index],
          y: pn.posY[index],
          vx: pn.velX[index],
          vy: pn.velY[index],
          size: pn.sizeA[index],
          objectX: particle.x,
          objectY: particle.y,
          objectVx: particle.velocity.x,
          objectVy: particle.velocity.y,
          objectSize: particle.size,
          hue: particle.hue,
          particleColor: particle.particleColor,
          expectedX: source.x + shiftX,
          expectedY: source.y + shiftY,
          source
        };
      });
      const well = pn.gravityWells.find(candidate => !expected.knownWellIds.includes(candidate.id));
      return {
        particleCount: pn.numParticles,
        objectCount: pn.o.length,
        wellCount: pn.gravityWells.length,
        particles,
        well: well ? { ...well } : null,
        expectedWell: { ...expected.well, x: expected.well.x + shiftX, y: expected.well.y + shiftY },
        pointer: firstPointer,
        groupCenter: well ? {
          x: (Math.min(...particles.map(particle => particle.x), well.x) + Math.max(...particles.map(particle => particle.x), well.x)) / 2,
          y: (Math.min(...particles.map(particle => particle.y), well.y) + Math.max(...particles.map(particle => particle.y), well.y)) / 2
        } : null,
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        typedArrayCapacity: pn.posX.length,
        clipboardStillLinked: pn._selectionClipboard.particleSources?.every((source, index) => source === pn.o[index]) &&
          pn._selectionClipboard.wellSourceIds?.[0] === expected.well.id
      };
    }, { expected: firstLiveSources, firstPointer });

    const secondLiveSources = await page.evaluate(selectedWellId => {
      const pn = window.particleInstance;
      const particles = [
        { x: -35, y: 745, velocityX: 3.5, velocityY: -0.25, size: 7, hue: 120, particleColor: '#22dd44' },
        { x: 1325, y: -25, velocityX: -1.75, velocityY: 2.5, size: 8, hue: 330, particleColor: '#dd2244' }
      ];
      particles.forEach((value, index) => {
        const particle = pn.o[index];
        particle.x = value.x;
        particle.y = value.y;
        particle.velocity.x = value.velocityX;
        particle.velocity.y = value.velocityY;
        particle.size = value.size;
        particle.hue = value.hue;
        particle.particleColor = value.particleColor;
        pn.posX[index] = value.x;
        pn.posY[index] = value.y;
        pn.velX[index] = value.velocityX;
        pn.velY[index] = value.velocityY;
        pn.sizeA[index] = value.size;
      });
      const well = pn.getGravityWell(selectedWellId);
      Object.assign(well, {
        type: 'black',
        x: 1350,
        y: 755,
        strength: 58,
        radius: 145,
        innerColor: '#eecc11',
        outerColor: '#1188cc'
      });
      return {
        particles,
        well: { ...well },
        knownWellIds: pn.gravityWells.map(candidate => candidate.id)
      };
    }, setup.selectedWellId);
    const secondPointer = { x: 1, y: 1 };
    await page.mouse.move(secondPointer.x, secondPointer.y);
    await page.keyboard.press('Control+v');
    const secondPaste = await page.evaluate(({ expected, secondPointer }) => {
      const pn = window.particleInstance;
      const start = 6;
      const sourcePoints = [...expected.particles, expected.well];
      const anchorX = (Math.min(...sourcePoints.map(point => point.x)) + Math.max(...sourcePoints.map(point => point.x))) / 2;
      const anchorY = (Math.min(...sourcePoints.map(point => point.y)) + Math.max(...sourcePoints.map(point => point.y))) / 2;
      const shiftX = secondPointer.x - anchorX;
      const shiftY = secondPointer.y - anchorY;
      const particles = expected.particles.map((source, offset) => {
        const index = start + offset;
        const particle = pn.o[index];
        return {
          x: pn.posX[index], y: pn.posY[index],
          vx: pn.velX[index], vy: pn.velY[index],
          size: pn.sizeA[index], objectSize: particle.size,
          hue: particle.hue, particleColor: particle.particleColor,
          expectedX: source.x + shiftX,
          expectedY: source.y + shiftY,
          source
        };
      });
      const well = pn.gravityWells.find(candidate => !expected.knownWellIds.includes(candidate.id));
      return {
        particleCount: pn.numParticles,
        wellCount: pn.gravityWells.length,
        particles,
        well: well ? { ...well } : null,
        expectedWell: { ...expected.well, x: expected.well.x + shiftX, y: expected.well.y + shiftY },
        pointer: secondPointer,
        groupCenter: well ? {
          x: (Math.min(...particles.map(particle => particle.x), well.x) + Math.max(...particles.map(particle => particle.x), well.x)) / 2,
          y: (Math.min(...particles.map(particle => particle.y), well.y) + Math.max(...particles.map(particle => particle.y), well.y)) / 2
        } : null,
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId
      };
    }, { expected: secondLiveSources, secondPointer });

    const fallbackPaste = await page.evaluate(selectedWellId => {
      const pn = window.particleInstance;
      const clipboard = pn._selectionClipboard;
      const frozen = {
        particles: clipboard.particles.map(particle => ({ ...particle })),
        wells: clipboard.wells.map(well => ({ ...well }))
      };
      const originalCount = pn.numParticles;
      pn.setParticleCount(originalCount + 1);
      const replacement = pn.o.pop();
      replacement.index = 0;
      pn.o[0] = replacement;
      pn._initSoAFromObjects(originalCount);
      if (pn.p) pn.p.index = originalCount;

      const remainingSource = clipboard.particleSources?.[1];
      const remainingIndex = pn.o.indexOf(remainingSource);
      if (remainingIndex >= 0) {
        Object.assign(remainingSource, {
          x: 1111,
          y: 612,
          size: 9,
          hue: 199,
          particleColor: '#abcdef'
        });
        remainingSource.velocity.x = 7;
        remainingSource.velocity.y = -7;
        pn.posX[remainingIndex] = remainingSource.x;
        pn.posY[remainingIndex] = remainingSource.y;
        pn.velX[remainingIndex] = remainingSource.velocity.x;
        pn.velY[remainingIndex] = remainingSource.velocity.y;
        pn.sizeA[remainingIndex] = remainingSource.size;
      }
      Object.assign(pn.getGravityWell(selectedWellId), {
        type: 'white',
        x: 999,
        y: 611,
        strength: -73,
        radius: 155,
        innerColor: '#123456',
        outerColor: '#fedcba'
      });
      const start = pn.numParticles;
      const knownWellIds = pn.gravityWells.map(well => well.id);
      const pointer = { x: 640, y: 700 };
      const sourcePoints = [...frozen.particles, ...frozen.wells];
      const anchorX = (Math.min(...sourcePoints.map(point => point.x)) + Math.max(...sourcePoints.map(point => point.x))) / 2;
      const anchorY = (Math.min(...sourcePoints.map(point => point.y)) + Math.max(...sourcePoints.map(point => point.y))) / 2;
      const shiftX = pointer.x - anchorX;
      const shiftY = pointer.y - anchorY;
      pn._gravityPointer = pointer;
      pn.pasteObjectSelection();
      const particles = frozen.particles.map((source, offset) => {
        const index = start + offset;
        const particle = pn.o[index];
        return {
          x: pn.posX[index], y: pn.posY[index],
          vx: pn.velX[index], vy: pn.velY[index],
          size: pn.sizeA[index], objectSize: particle.size,
          hue: particle.hue, particleColor: particle.particleColor,
          expectedX: source.x + shiftX,
          expectedY: source.y + shiftY,
          source
        };
      });
      const well = pn.gravityWells.find(candidate => !knownWellIds.includes(candidate.id));
      return {
        particleCount: pn.numParticles,
        wellCount: pn.gravityWells.length,
        particles,
        well: well ? { ...well } : null,
        expectedWell: { ...frozen.wells[0], x: frozen.wells[0].x + shiftX, y: frozen.wells[0].y + shiftY },
        pointer,
        oneSourceMissing: !pn.o.includes(clipboard.particleSources?.[0]) && remainingIndex >= 0,
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId
      };
    }, setup.selectedWellId);

    const pasteUndos = [];
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Control+z');
      pasteUndos.push(await page.evaluate(() => {
        const pn = window.particleInstance;
        return {
          particleCount: pn.numParticles,
          wellCount: pn.gravityWells.length,
          selectedParticles: Array.from(pn.selectedParticleIndices),
          selectedWells: Array.from(pn.selectedGravityWellIds),
          primaryWell: pn.selectedGravityWellId,
          undoDepth: pn._selectionUndoStack?.length
        };
      }));
    }

    await page.evaluate(() => {
      const pn = window.particleInstance;
      pn._ensureAnimationLoop = window.__selectionTestEnsureLoop;
      delete window.__selectionTestEnsureLoop;
      pn.options.gravityWellsEnabled = true;
      pn._ensureAnimationLoop();
    });

    await page.evaluate(() => window.particleInstance.clearObjectSelection());
    await page.mouse.move(800, 500);
    await page.keyboard.press('Delete');
    const hoveredWellDelete = await page.evaluate(expectedId => ({
      removed: !window.particleInstance.getGravityWell(expectedId),
      undoDepth: window.particleInstance._selectionUndoStack?.length
    }), setup.outsideWellId);
    await page.keyboard.press('Control+z');
    const hoveredWellDeleteUndo = await page.evaluate(expectedId => ({
      restored: !!window.particleInstance.getGravityWell(expectedId),
      undoDepth: window.particleInstance._selectionUndoStack?.length
    }), setup.outsideWellId);

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
    await page.evaluate(() => {
      const pn = window.particleInstance;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      window.__selectionUndoTestEnsureLoop = pn._ensureAnimationLoop;
      pn._ensureAnimationLoop = function() {};
      pn._syncObjectsFromSoA();
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
    await page.keyboard.press('Control+z');
    const deleteUndo = await page.evaluate(expected => {
      const pn = window.particleInstance;
      return {
        particleCount: pn.numParticles,
        objectCount: pn.o.length,
        wellCount: pn.gravityWells.length,
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        typedArrayLengths: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length],
        expectedParticleCount: expected.particleCount,
        expectedWellCount: expected.wellCount,
        undoDepth: pn._selectionUndoStack?.length
      };
    }, selectAll);

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
      return {
        particleHues: pn.o.map(particle => particle.hue),
        keptParticleHue: pn.o[1].hue,
        removedWell: { ...removedWell },
        keptWellId: keptWell.id
      };
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
    await page.keyboard.press('Control+z');
    const partialDeleteUndo = await page.evaluate(expected => {
      const pn = window.particleInstance;
      return {
        particleCount: pn.numParticles,
        particleHues: pn.o.map(particle => particle.hue),
        typedArrayLengths: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length],
        wells: pn.gravityWells.map(well => ({ ...well })),
        selectedParticles: Array.from(pn.selectedParticleIndices),
        selectedWells: Array.from(pn.selectedGravityWellIds),
        primaryWell: pn.selectedGravityWellId,
        expected
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
    const nativeUndo = await page.evaluate(() => {
      const emptyEvent = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(emptyEvent);
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      input.focus();
      const editableEvent = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(editableEvent);
      input.remove();
      const pn = window.particleInstance;
      pn._ensureAnimationLoop = window.__selectionUndoTestEnsureLoop;
      delete window.__selectionUndoTestEnsureLoop;
      window.hotkeyManager.showToast = window.__selectionTestShowToast;
      delete window.__selectionTestShowToast;
      return {
        emptyDefaultPrevented: emptyEvent.defaultPrevented,
        editableDefaultPrevented: editableEvent.defaultPrevented,
        undoDepth: pn._selectionUndoStack?.length
      };
    });

    const matchesParticleSnapshot = particle =>
      close(particle.x, particle.expectedX) && close(particle.y, particle.expectedY) &&
      close(particle.vx, particle.source.velocityX) && close(particle.vy, particle.source.velocityY) &&
      particle.size === particle.source.size && particle.objectSize === particle.source.size &&
      particle.hue === particle.source.hue && particle.particleColor === particle.source.particleColor;
    const matchesWellSnapshot = paste => paste.well && paste.expectedWell &&
      paste.well.id !== paste.expectedWell.id && paste.well.type === paste.expectedWell.type &&
      close(paste.well.x, paste.expectedWell.x) && close(paste.well.y, paste.expectedWell.y) &&
      paste.well.radius === paste.expectedWell.radius && paste.well.strength === paste.expectedWell.strength &&
      paste.well.innerColor === paste.expectedWell.innerColor && paste.well.outerColor === paste.expectedWell.outerColor;

    const assertions = {
      marqueeMatchesDesktopSelection: marquee.display === 'block' && marquee.borderStyle === 'dashed' &&
        marquee.backgroundColor !== 'rgba(0, 0, 0, 0)' && close(marquee.left, 100) && close(marquee.top, 100) &&
        close(marquee.width, 300, 2) && close(marquee.height, 300, 2) && marquee.cursor === 'crosshair',
      marqueeSuppressesOtherGestures: marquee.forcesClear && marquee.noWellDrag && marquee.noCursorCapture,
      selectsParticlesAndWellsByCenter: selected.particles.join(',') === '0,1' &&
        selected.wells.length === 1 && selected.wells[0] === setup.selectedWellId &&
        selected.primaryWell === setup.selectedWellId,
      marqueeShowsSelectionToast: selected.toast === 'Selected 2 particles + 1 well',
      marqueeCleansUpOnRelease: selected.marqueeHidden && selected.selectionOverlayVisible && selected.cursorReset,
      dragsMixedSelectionAsOneGroup: groupDragging.dragActive && groupDragging.cursor === 'grabbing' &&
        groupDragging.forcesClear &&
        groupDragging.particles.every(particle => close(particle.x, particle.expectedX) && close(particle.y, particle.expectedY)) &&
        groupDragging.wells.every(well => close(well.x, well.expectedX) && close(well.y, well.expectedY)) &&
        groupDragging.selectedParticles.join(',') === selected.particles.join(',') &&
        groupDragging.selectedWells.join(',') === selected.wells.join(',') &&
        groupDragReleased.dragStopped && groupDragReleased.classCleared,
      ctrlCCopiesWithoutOpeningControls: paneBeforeCopy && copied.paneStillHidden &&
        copied.particles === 2 && copied.wells === 1 && copied.particleSources === 2 &&
        copied.wellSourceIds?.join(',') === setup.selectedWellId,
      ctrlVPastesLatestParticleState: firstPaste.particleCount === 6 && firstPaste.objectCount === 6 &&
        firstPaste.typedArrayCapacity >= 6 && firstPaste.particles.every(matchesParticleSnapshot) &&
        firstPaste.particles.every(particle => close(particle.objectX, particle.expectedX) &&
          close(particle.objectY, particle.expectedY) && close(particle.objectVx, particle.source.velocityX) &&
          close(particle.objectVy, particle.source.velocityY)),
      ctrlVPastesLatestWellState: firstPaste.wellCount === 3 && matchesWellSnapshot(firstPaste),
      pasteCentersLiveSelectionAtCursor: firstPaste.groupCenter &&
        close(firstPaste.groupCenter.x, firstPaste.pointer.x) && close(firstPaste.groupCenter.y, firstPaste.pointer.y),
      repeatedCtrlVResamplesOriginals: secondPaste.particleCount === 8 && secondPaste.wellCount === 4 &&
        secondPaste.particles.every(matchesParticleSnapshot) && matchesWellSnapshot(secondPaste) &&
        close(secondPaste.groupCenter.x, secondPaste.pointer.x) && close(secondPaste.groupCenter.y, secondPaste.pointer.y) &&
        secondPaste.particles.some(particle => particle.x < 0 || particle.x > 1280 || particle.y < 0 || particle.y > 720),
      missingSourceUsesWholeFrozenSnapshot: fallbackPaste.oneSourceMissing && fallbackPaste.particleCount === 10 &&
        fallbackPaste.wellCount === 5 && fallbackPaste.particles.every(matchesParticleSnapshot) &&
        matchesWellSnapshot(fallbackPaste),
      clipboardStaysLinkedToOriginals: firstPaste.clipboardStillLinked,
      pastedObjectsBecomeSelection: firstPaste.selectedParticles.join(',') === '4,5' &&
        firstPaste.selectedWells.join(',') === firstPaste.well.id && firstPaste.primaryWell === firstPaste.well.id &&
        secondPaste.selectedParticles.join(',') === '6,7' && secondPaste.selectedWells.join(',') === secondPaste.well.id &&
        secondPaste.primaryWell === secondPaste.well.id && fallbackPaste.selectedParticles.join(',') === '8,9' &&
        fallbackPaste.selectedWells.join(',') === fallbackPaste.well.id && fallbackPaste.primaryWell === fallbackPaste.well.id,
      ctrlZUndoesPastesInLifoOrder: pasteUndos.length === 3 &&
        pasteUndos[0].particleCount === 8 && pasteUndos[0].wellCount === 4 && pasteUndos[0].undoDepth === 2 &&
        pasteUndos[0].selectedParticles.join(',') === '6,7' && pasteUndos[0].selectedWells.join(',') === secondPaste.well.id &&
        pasteUndos[1].particleCount === 6 && pasteUndos[1].wellCount === 3 && pasteUndos[1].undoDepth === 1 &&
        pasteUndos[1].selectedParticles.join(',') === '4,5' && pasteUndos[1].selectedWells.join(',') === firstPaste.well.id &&
        pasteUndos[2].particleCount === 4 && pasteUndos[2].wellCount === 2 && pasteUndos[2].undoDepth === 0,
      ctrlZRestoresHoveredWellDeletion: hoveredWellDelete.removed && hoveredWellDelete.undoDepth === 1 &&
        hoveredWellDeleteUndo.restored && hoveredWellDeleteUndo.undoDepth === 0,
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
      ctrlZRestoresEntireDeletion: deleteUndo.particleCount === deleteUndo.expectedParticleCount &&
        deleteUndo.objectCount === deleteUndo.expectedParticleCount && deleteUndo.wellCount === deleteUndo.expectedWellCount &&
        deleteUndo.typedArrayLengths.every(length => length === deleteUndo.expectedParticleCount) &&
        deleteUndo.selectedParticles.length === deleteUndo.expectedParticleCount &&
        deleteUndo.selectedWells.length === deleteUndo.expectedWellCount && deleteUndo.undoDepth === 0,
      deletePreservesAndReindexesUnselectedObjects: partialDelete.particleCount === 1 &&
        partialDelete.survivorReindexed && partialDelete.typedArrayLengths.every(length => length === 1) &&
        partialDelete.wells.join(',') === partialDelete.expectedWellId && partialDelete.selectionClear,
      ctrlZRestoresPartialDeletionInPlace: partialDeleteUndo.particleCount === 3 &&
        partialDeleteUndo.particleHues.join(',') === partialDeleteUndo.expected.particleHues.join(',') &&
        partialDeleteUndo.typedArrayLengths.every(length => length === 3) &&
        partialDeleteUndo.wells.length === 2 &&
        partialDeleteUndo.wells.some(well => well.id === partialDeleteUndo.expected.removedWell.id &&
          well.type === partialDeleteUndo.expected.removedWell.type && well.x === partialDeleteUndo.expected.removedWell.x &&
          well.y === partialDeleteUndo.expected.removedWell.y && well.radius === partialDeleteUndo.expected.removedWell.radius &&
          well.strength === partialDeleteUndo.expected.removedWell.strength &&
          well.innerColor === partialDeleteUndo.expected.removedWell.innerColor &&
          well.outerColor === partialDeleteUndo.expected.removedWell.outerColor) &&
        partialDeleteUndo.selectedParticles.join(',') === '0,2' &&
        partialDeleteUndo.selectedWells.join(',') === partialDeleteUndo.expected.removedWell.id &&
        partialDeleteUndo.primaryWell === partialDeleteUndo.expected.removedWell.id,
      escapeClearsSelection: escaped.selectionClear && escaped.overlayHidden,
      emptyCtrlCPreservesNativeCopy: !emptyCopy.defaultPrevented,
      emptyAndEditableCtrlZPreserveNativeUndo: !nativeUndo.emptyDefaultPrevented &&
        !nativeUndo.editableDefaultPrevented && nativeUndo.undoDepth === 0,
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
      firstLiveSources,
      firstPaste,
      secondLiveSources,
      secondPaste,
      fallbackPaste,
      pasteUndos,
      hoveredWellDelete,
      hoveredWellDeleteUndo,
      singleWellCopy,
      selectAll,
      deleted,
      deleteUndo,
      partialDelete,
      partialDeleteUndo,
      emptyCopy,
      nativeUndo
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
