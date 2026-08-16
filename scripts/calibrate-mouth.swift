import Foundation
import AppKit
import Vision

// 用法: swift scripts/calibrate-mouth.swift <image_path>...
// 提取面部关键点 → 输出 AvatarRig JSON 行（坐标已归一化为图像比例，左上原点，y 向下）

for path in CommandLine.arguments.dropFirst() {
    let name = (path as NSString).lastPathComponent
    guard let img = NSImage(contentsOfFile: path),
          let tiff = img.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let cg = rep.cgImage else {
        print("{\"id\": \"\(name)\", \"error\": \"load failed\"}")
        continue
    }
    let w = Double(rep.pixelsWide)
    let h = Double(rep.pixelsHigh)

    let request = VNDetectFaceLandmarksRequest()
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([request])
    } catch {
        print("{\"id\": \"\(name)\", \"error\": \"vision: \(error.localizedDescription)\"}")
        continue
    }
    guard let face = request.results?.first else {
        print("{\"id\": \"\(name)\", \"error\": \"no face\"}")
        continue
    }

    // pointsInImage 返回像素坐标（y 轴为左下原点）→ 转顶部原点比例
    func region(_ r: VNFaceLandmarkRegion2D?) -> (cx: Double, cy: Double, w: Double, h: Double)? {
        guard let r = r, r.pointCount > 0 else { return nil }
        var minX = w, maxX = 0.0, sumY = 0.0, minY = h, maxY = 0.0
        for p in r.pointsInImage(imageSize: CGSize(width: w, height: h)) {
            minX = min(minX, p.x); maxX = max(maxX, p.x)
            let yTop = h - p.y
            minY = min(minY, yTop); maxY = max(maxY, yTop)
            sumY += yTop
        }
        let n = Double(r.pointCount)
        return ((minX + maxX) / 2 / w, (sumY / n) / h, (maxX - minX) / w, (maxY - minY) / h)
    }

    let bb = face.boundingBox // 归一化，左下原点
    let faceBox = (x: bb.origin.x, y: 1 - (bb.origin.y + bb.size.height), w: bb.width, h: bb.size.height)

    guard let mouth = region(face.landmarks?.outerLips),
          let le = region(face.landmarks?.leftEye),
          let re = region(face.landmarks?.rightEye) else {
        print("{\"id\": \"\(name)\", \"error\": \"missing landmarks\"}")
        continue
    }

    // 下巴：faceContour 最低点（顶部原点 y 最大）
    var chinY = faceBox.y + faceBox.h
    if let contour = face.landmarks?.faceContour, contour.pointCount > 0 {
        var m = 0.0
        for p in contour.pointsInImage(imageSize: CGSize(width: w, height: h)) {
            m = max(m, h - p.y)
        }
        chinY = m / h
    }

    let out = String(format:
        "{\"id\": \"%@\", \"imgW\": %.0f, \"imgH\": %.0f, \"face\": {\"x\": %.4f, \"y\": %.4f, \"w\": %.4f, \"h\": %.4f}, \"mouth\": {\"x\": %.4f, \"y\": %.4f, \"w\": %.4f, \"h\": %.4f}, \"leftEye\": {\"x\": %.4f, \"y\": %.4f, \"w\": %.4f, \"h\": %.4f}, \"rightEye\": {\"x\": %.4f, \"y\": %.4f, \"w\": %.4f, \"h\": %.4f}, \"chin\": %.4f}",
        String(name.split(separator: ".").first ?? Substring(name)),
        w, h,
        faceBox.x, faceBox.y, faceBox.w, faceBox.h,
        mouth.cx, mouth.cy, mouth.w, mouth.h,
        le.cx, le.cy, le.w, le.h,
        re.cx, re.cy, re.w, re.h,
        chinY)
    print(out)
}
