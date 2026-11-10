const DEFAULT_OPTIONS = {
  maxSamples: 5000,
  minAnisotropy: 2.5,
  alignmentThreshold: 0.9,
  floorQuantile: 0.08,
  eyeHeight: 1.6,
  eyeHeightOffset: 0.3,
  eyeBandPadding: 0.35,
  minPlanarSamples: 48,
  histogramBinSize: 0.2,
  peakMergeDistance: 0.45,
  candidateFloorLimit: 10,
  clusterCellSize: 1
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = clamp(q, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  return lerp(sortedValues[lower], sortedValues[upper], index - lower);
}

function mean(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length === 0) {
    return [0, 1, 0];
  }

  return vector.map((value) => value / length);
}

function rotateVectorByQuaternion(vector, quaternion) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = (qw * x) + (qy * z) - (qz * y);
  const iy = (qw * y) + (qz * x) - (qx * z);
  const iz = (qw * z) + (qx * y) - (qy * x);
  const iw = (-qx * x) - (qy * y) - (qz * z);

  return [
    (ix * qw) + (iw * -qx) + (iy * -qz) - (iz * -qy),
    (iy * qw) + (iw * -qy) + (iz * -qx) - (ix * -qz),
    (iz * qw) + (iw * -qz) + (ix * -qy) - (iy * -qx)
  ];
}

function rotateVectorByEuler(vector, rotation) {
  const [rx, ry, rz] = rotation;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);

  let [x, y, z] = vector;

  let nextY = (y * cosX) - (z * sinX);
  let nextZ = (y * sinX) + (z * cosX);
  y = nextY;
  z = nextZ;

  let nextX = (x * cosY) + (z * sinY);
  nextZ = (-x * sinY) + (z * cosY);
  x = nextX;
  z = nextZ;

  nextX = (x * cosZ) - (y * sinZ);
  nextY = (x * sinZ) + (y * cosZ);

  return [nextX, nextY, z];
}

function transformPoint(center, scale, rotation, translation) {
  const scaled = [
    center[0] * scale[0],
    center[1] * scale[1],
    center[2] * scale[2]
  ];
  const rotated = rotateVectorByEuler(scaled, rotation);

  return [
    rotated[0] + translation[0],
    rotated[1] + translation[1],
    rotated[2] + translation[2]
  ];
}

function transformNormal(normal, rotation) {
  return normalizeVector(rotateVectorByEuler(normal, rotation));
}

function normalizeScale(scale) {
  if (Array.isArray(scale)) {
    return [
      scale[0] ?? 1,
      scale[1] ?? scale[0] ?? 1,
      scale[2] ?? scale[0] ?? 1
    ];
  }

  return [scale ?? 1, scale ?? 1, scale ?? 1];
}

function getSurfaceNormal(scales, quaternion) {
  const minAxisIndex = (scales[0] <= scales[1] && scales[0] <= scales[2])
    ? 0
    : ((scales[1] <= scales[2]) ? 1 : 2);

  const basis = minAxisIndex === 0
    ? [1, 0, 0]
    : (minAxisIndex === 1 ? [0, 1, 0] : [0, 0, 1]);

  return normalizeVector(rotateVectorByQuaternion(basis, quaternion));
}

function buildSample({ getSplatCount, getSplat, transform = {} }, options) {
  const totalSplats = getSplatCount?.() ?? 0;

  if (!totalSplats || typeof getSplat !== 'function') {
    return [];
  }

  const sampleCount = Math.min(totalSplats, options.maxSamples);
  const stride = Math.max(1, Math.floor(totalSplats / sampleCount));
  const rotation = transform.rotation ?? [0, 0, 0];
  const translation = transform.translation ?? [0, 0, 0];
  const scale = normalizeScale(transform.scale ?? 1);
  const sample = [];

  for (let index = 0; index < totalSplats; index += stride) {
    const splat = getSplat(index);

    if (!splat?.center || !splat?.scales || !splat?.quaternion) {
      continue;
    }

    const localCenter = [splat.center.x, splat.center.y, splat.center.z];
    const localScales = [splat.scales.x, splat.scales.y, splat.scales.z];
    const localQuaternion = [
      splat.quaternion.x,
      splat.quaternion.y,
      splat.quaternion.z,
      splat.quaternion.w
    ];
    const localNormal = getSurfaceNormal(localScales, localQuaternion);

    sample.push({
      center: transformPoint(localCenter, scale, rotation, translation),
      normal: transformNormal(localNormal, rotation),
      anisotropy: Math.max(...localScales) / Math.max(Math.min(...localScales), 1e-9),
      opacity: splat.opacity ?? 1
    });
  }

  return sample;
}

function extractPlanarSample(sample, options) {
  const planar = sample.filter((entry) =>
    entry.anisotropy >= options.minAnisotropy &&
    Math.abs(entry.normal[1]) >= options.alignmentThreshold
  );

  return planar.length >= options.minPlanarSamples ? planar : null;
}

function buildHistogram(values, binSize) {
  const histogram = new Map();

  for (const value of values) {
    const bin = Math.round(value / binSize) * binSize;
    histogram.set(bin, (histogram.get(bin) || 0) + 1);
  }

  return [...histogram.entries()]
    .map(([y, count]) => ({ y: Number(y), count }))
    .sort((left, right) => right.count - left.count);
}

function mergePeaks(peaks, mergeDistance, limit) {
  const merged = [];

  for (const peak of peaks) {
    if (merged.some((existing) => Math.abs(existing.y - peak.y) < mergeDistance)) {
      continue;
    }

    merged.push(peak);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged.sort((left, right) => left.y - right.y);
}

function findCeilingPeak(planar, floorY, options) {
  const candidates = planar
    .map((entry) => entry.center[1])
    .filter((value) => value >= floorY + 1.4 && value <= floorY + 6);

  if (!candidates.length) {
    return floorY + 2.6;
  }

  const peaks = mergePeaks(
    buildHistogram(candidates, options.histogramBinSize),
    options.peakMergeDistance,
    options.candidateFloorLimit
  );

  if (!peaks.length) {
    return quantile(candidates.sort((left, right) => left - right), 0.9);
  }

  return peaks[peaks.length - 1].y;
}

function buildClusters(points, cellSize) {
  if (!points.length) {
    return [];
  }

  const grid = new Map();

  for (const point of points) {
    const gx = Math.round(point.center[0] / cellSize);
    const gz = Math.round(point.center[2] / cellSize);
    const key = `${gx},${gz}`;
    const cell = grid.get(key) ?? {
      gx,
      gz,
      x: gx * cellSize,
      z: gz * cellSize,
      count: 0
    };
    cell.count += 1;
    grid.set(key, cell);
  }

  const visited = new Set();
  const directions = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      if (dx === 0 && dz === 0) {
        continue;
      }

      directions.push([dx, dz]);
    }
  }
  const clusters = [];

  for (const [key, startCell] of grid.entries()) {
    if (visited.has(key)) {
      continue;
    }

    const queue = [startCell];
    const cells = [];
    let totalCount = 0;
    let maxCellCount = 0;
    let weightedX = 0;
    let weightedZ = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    visited.add(key);

    while (queue.length) {
      const cell = queue.shift();
      cells.push(cell);
      totalCount += cell.count;
      maxCellCount = Math.max(maxCellCount, cell.count);
      weightedX += cell.x * cell.count;
      weightedZ += cell.z * cell.count;
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minZ = Math.min(minZ, cell.z);
      maxZ = Math.max(maxZ, cell.z);

      for (const [dx, dz] of directions) {
        const neighborKey = `${cell.gx + dx},${cell.gz + dz}`;

        if (visited.has(neighborKey) || !grid.has(neighborKey)) {
          continue;
        }

        visited.add(neighborKey);
        queue.push(grid.get(neighborKey));
      }
    }

    const density = totalCount / Math.max(cells.length, 1);
    clusters.push({
      cells,
      totalCount,
      density,
      maxCellCount,
      cellSize,
      center: {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2
      },
      weightedCenter: {
        x: weightedX / Math.max(totalCount, 1),
        z: weightedZ / Math.max(totalCount, 1)
      },
      bounds: {
        minX,
        maxX,
        minZ,
        maxZ
      },
      score: density * Math.sqrt(totalCount)
    });
  }

  return clusters.sort((left, right) =>
    right.score - left.score ||
    right.totalCount - left.totalCount
  );
}

function chooseBestFloorCandidate(sample, planar, options) {
  const peaks = mergePeaks(
    buildHistogram(planar.map((entry) => entry.center[1]), options.histogramBinSize),
    options.peakMergeDistance,
    options.candidateFloorLimit
  );

  const scoredCandidates = peaks
    .map((peak) => {
      const ceilingY = findCeilingPeak(planar, peak.y, options);
      const roomHeight = Math.max(ceilingY - peak.y, 1.8);
      const eyeY = peak.y +
        clamp(options.eyeHeight, roomHeight * 0.18, roomHeight * 0.45);
      const eyeBandPadding = Math.max(options.eyeBandPadding, roomHeight * 0.08);
      const eyeBand = sample.filter((entry) => Math.abs(entry.center[1] - eyeY) <= eyeBandPadding);
      const clusters = buildClusters(eyeBand, options.clusterCellSize);
      const bestCluster = clusters[0] ?? null;

      if (!bestCluster) {
        return null;
      }

      return {
        floorY: peak.y,
        ceilingY,
        eyeY,
        roomHeight,
        clusters,
        cluster: bestCluster,
        score: bestCluster.score,
        peakCount: peak.count,
        eyeBandCount: eyeBand.length
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.score - left.score ||
      right.cluster.totalCount - left.cluster.totalCount ||
      right.peakCount - left.peakCount
    );

  return scoredCandidates.length
    ? { best: scoredCandidates[0], candidates: scoredCandidates, peaks }
    : null;
}

function buildCandidateGrid(min, max, step) {
  const values = [];

  for (let current = min; current <= max; current += step) {
    values.push(current);
  }

  if (!values.length || values[values.length - 1] < max) {
    values.push(max);
  }

  return values;
}

function chooseCameraPosition(cluster, target, eyeY, roomHeight) {
  const xSpan = Math.max(cluster.bounds.maxX - cluster.bounds.minX, cluster.cellSize * 2);
  const zSpan = Math.max(cluster.bounds.maxZ - cluster.bounds.minZ, cluster.cellSize * 2);
  const horizontalSpan = Math.hypot(xSpan, zSpan);
  const desiredDistance = clamp(horizontalSpan * 0.18, 1.25, 3.5);
  const desiredClearance = clamp(Math.min(xSpan, zSpan) * 0.25, 0.75, 1.75);
  const candidateRadius = Math.max(cluster.cellSize * 0.95, 0.6);
  const gridStep = cluster.cellSize;
  const candidatesX = buildCandidateGrid(cluster.bounds.minX, cluster.bounds.maxX, gridStep);
  const candidatesZ = buildCandidateGrid(cluster.bounds.minZ, cluster.bounds.maxZ, gridStep);

  let bestCandidate = null;

  for (const x of candidatesX) {
    for (const z of candidatesZ) {
      const distance = Math.hypot(x - target.x, z - target.z);

      if (distance < gridStep * 1.25 || distance > desiredDistance * 1.9) {
        continue;
      }

      let localDensity = 0;
      let nearestClusterDistance = Infinity;

      for (const cell of cluster.cells) {
        const cellDistance = Math.hypot(cell.x - x, cell.z - z);
        nearestClusterDistance = Math.min(nearestClusterDistance, cellDistance);

        if (cellDistance <= candidateRadius) {
          localDensity += cell.count;
        }
      }

      const score =
        (localDensity * 6) +
        Math.abs(distance - desiredDistance) +
        (Math.abs(nearestClusterDistance - desiredClearance) * 0.9) +
        (Math.abs(x - cluster.center.x) * 0.03) +
        (Math.abs(z - cluster.center.z) * 0.03);

      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { x, z, score, localDensity };
      }
    }
  }

  if (!bestCandidate) {
    return {
      x: cluster.center.x,
      y: eyeY,
      z: cluster.center.z + (desiredDistance * 0.5)
    };
  }

  return {
    x: lerp(bestCandidate.x, cluster.center.x, 0.45),
    y: eyeY,
    z: lerp(bestCandidate.z, cluster.center.z, 0.45)
  };
}

function fallbackEstimate(sample) {
  const xs = sample.map((entry) => entry.center[0]).sort((left, right) => left - right);
  const ys = sample.map((entry) => entry.center[1]).sort((left, right) => left - right);
  const zs = sample.map((entry) => entry.center[2]).sort((left, right) => left - right);
  const xSpan = quantile(xs, 0.95) - quantile(xs, 0.05);
  const zSpan = quantile(zs, 0.95) - quantile(zs, 0.05);
  const distance = clamp(Math.hypot(xSpan, zSpan) * 0.22, 2, 6);
  const target = {
    x: quantile(xs, 0.5),
    y: quantile(ys, 0.5),
    z: quantile(zs, 0.5)
  };

  return {
    target,
    camera: {
      x: target.x,
      y: target.y + (distance * 0.2),
      z: target.z + distance
    },
    diagnostics: {
      mode: 'fallback'
    }
  };
}

export function estimateSplatCamera({ getSplatCount, getSplat, transform = {} }, overrideOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...overrideOptions };
  const sample = buildSample({ getSplatCount, getSplat, transform }, options);

  if (!sample.length) {
    return null;
  }

  const planar = extractPlanarSample(sample, options);

  if (!planar) {
    return fallbackEstimate(sample);
  }

  const xs = sample.map((entry) => entry.center[0]).sort((left, right) => left - right);
  const ys = sample.map((entry) => entry.center[1]).sort((left, right) => left - right);
  const zs = sample.map((entry) => entry.center[2]).sort((left, right) => left - right);
  const candidateSelection = chooseBestFloorCandidate(sample, planar, options);

  if (!candidateSelection) {
    return fallbackEstimate(sample);
  }

  const selected = candidateSelection.best;
  const roomHeight = selected.roomHeight;
  const eyeY = selected.eyeY + options.eyeHeightOffset;
  const target = {
    x: selected.cluster.center.x,
    y: clamp(selected.floorY + (roomHeight * 0.62), eyeY + 0.35, selected.ceilingY - 0.35),
    z: selected.cluster.center.z
  };
  const camera = chooseCameraPosition(selected.cluster, target, eyeY, roomHeight);

  return {
    target,
    camera,
    diagnostics: {
      mode: 'clustered-floor',
      floorY: selected.floorY,
      ceilingY: selected.ceilingY,
      eyeY,
      roomHeight,
      planarSamples: planar.length,
      selectedCluster: {
        totalCount: selected.cluster.totalCount,
        density: selected.cluster.density,
        bounds: selected.cluster.bounds
      },
      candidateFloors: candidateSelection.candidates.map((candidate) => ({
        floorY: candidate.floorY,
        ceilingY: candidate.ceilingY,
        eyeY: candidate.eyeY,
        score: candidate.score,
        clusterCount: candidate.clusters.length,
        clusterDensity: candidate.cluster.density,
        clusterPoints: candidate.cluster.totalCount
      })),
      robustBounds: {
        min: {
          x: quantile(xs, 0.05),
          y: quantile(ys, 0.05),
          z: quantile(zs, 0.05)
        },
        max: {
          x: quantile(xs, 0.95),
          y: quantile(ys, 0.95),
          z: quantile(zs, 0.95)
        }
      }
    }
  };
}
