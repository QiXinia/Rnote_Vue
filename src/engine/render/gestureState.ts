// Mutable, non-reactive flags describing transient interaction gestures.
// The renderer reads these to trade a little sharpness for frame stability
// while a zoom gesture is in progress, then re-rasters once it settles.
export const gestureState = {
  // True while the user is actively zooming (ctrl/cmd-wheel or pinch). During
  // this window raster sprites are reused even if their resolution bucket is
  // below the current device pixel scale, so no stroke re-rasters mid-gesture.
  zooming: false
}
