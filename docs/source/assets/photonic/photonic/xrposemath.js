import * as THREE from 'three';

export function solveOriginPoseForViewerPose({
  viewerLocalPosition,
  viewerLocalQuaternion,
  desiredWorldPosition,
  desiredWorldQuaternion
}) {
  const originQuaternion = desiredWorldQuaternion.clone()
    .multiply(viewerLocalQuaternion.clone().invert());

  const originPosition = desiredWorldPosition.clone().sub(
    viewerLocalPosition.clone().applyQuaternion(originQuaternion)
  );

  return {
    position: originPosition,
    quaternion: originQuaternion
  };
}

export function composeViewerWorldPose({
  originPosition,
  originQuaternion,
  viewerLocalPosition,
  viewerLocalQuaternion
}) {
  return {
    position: viewerLocalPosition.clone()
      .applyQuaternion(originQuaternion)
      .add(originPosition),
    quaternion: originQuaternion.clone().multiply(viewerLocalQuaternion)
  };
}

export function createPose(position, quaternion) {
  return {
    position: position instanceof THREE.Vector3 ? position.clone() : new THREE.Vector3(),
    quaternion: quaternion instanceof THREE.Quaternion ? quaternion.clone() : new THREE.Quaternion()
  };
}
