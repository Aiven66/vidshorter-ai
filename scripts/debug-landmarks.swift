import Foundation
import AppKit
import Vision

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let cg = rep.cgImage else { fatalError("load failed") }
let w = rep.pixelsWide, h = rep.pixelsHigh
print("image: \(w)x\(h)")

let request = VNDetectFaceLandmarksRequest()
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([request])
guard let face = request.results?.first else { fatalError("no face") }

let bb = face.boundingBox
print(String(format: "bb: x=%.4f y=%.4f w=%.4f h=%.4f (origin bottom-left)", bb.origin.x, bb.origin.y, bb.width, bb.height))

for (name, region) in [("outerLips", face.landmarks?.outerLips), ("leftEye", face.landmarks?.leftEye), ("rightEye", face.landmarks?.rightEye), ("nose", face.landmarks?.nose), ("faceContour", face.landmarks?.faceContour)] {
    guard let r = region else { print("\(name): nil"); continue }
    var s = ""
    for p in r.pointsInImage(imageSize: CGSize(width: w, height: h)).prefix(4) {
        s += String(format: "(%.3f,%.3f) ", p.x / Double(w), p.y / Double(h))
    }
    print("\(name) n=\(r.pointCount) first4: \(s)")
}
