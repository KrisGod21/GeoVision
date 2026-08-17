/**
 * Cover-fit geometry, shared by the canvas draw and anything that has to sit on
 * top of it at a fixed point in the source image.
 *
 * The hero fills the viewport with a 16:9 frame, cropping the overflow. Any
 * overlay pinned to a feature of the frame -- a watermark cover, an annotation
 * -- has to be positioned through the same transform, or it drifts away from
 * the thing it is covering as the viewport changes shape.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a rectangle of the source image lands inside a container that is
 * cover-fitting that image.
 *
 * `source` is the intrinsic image size, `container` the element it is drawn
 * into, and `rect` a region in source pixel coordinates. The result is in
 * container pixel coordinates and may be partly or wholly outside the
 * container, which is correct: cover-fit crops.
 */
export function mapRectToCover(source: Size, container: Size, rect: Rect): Rect {
  if (source.width <= 0 || source.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  // Cover: scale so the image fills both axes, cropping the longer one.
  const scale = Math.max(container.width / source.width, container.height / source.height);

  const drawnWidth = source.width * scale;
  const drawnHeight = source.height * scale;

  // Centred, so the crop is symmetric.
  const offsetX = (container.width - drawnWidth) / 2;
  const offsetY = (container.height - drawnHeight) / 2;

  return {
    left: offsetX + rect.left * scale,
    top: offsetY + rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Grows a rectangle about its centre by `factor`. */
export function expandRect(rect: Rect, factor: number): Rect {
  const width = rect.width * factor;
  const height = rect.height * factor;
  return {
    left: rect.left - (width - rect.width) / 2,
    top: rect.top - (height - rect.height) / 2,
    width,
    height,
  };
}
