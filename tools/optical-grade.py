"""Grade the capture background and preserve the recorded performer with the aligned matte."""
import argparse
from pathlib import Path
import subprocess
import time
import cv2
import numpy as np


def grade(plates, output, high, source_timeout=0):
    first = cv2.imread(str(plates / "000.png"), cv2.IMREAD_UNCHANGED)
    if first is None or first.shape[-1] != 4:
        raise ValueError("Expected a sequence of color plates with the subject alpha in channel four")
    h,w = first.shape[:2]
    height,width = (h*2,w*2) if high else (h,w)
    yy,xx=np.mgrid[:height,:width].astype("float32")
    x=xx/width; y=yy/height
    def glow(cx,cy,rx,ry):
        return np.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.7)
    cyan=glow(-.08,-.10,.66,.63)
    blue=glow(1.02,.02,.48,.71)
    violet=glow(-.10,1.05,.67,.60)
    mint=glow(.37,1.20,.63,.40)
    # The neutral image's rig lines survive into a darker, atmospheric working space.
    base=np.empty((height,width,3),np.float32)
    base[...,0]=16+cyan*30+blue*34+violet*31+mint*7
    base[...,1]=17+cyan*40+blue*16+violet*8+mint*13
    base[...,2]=13+cyan*9+blue*7+violet*22+mint*2
    # A fixed, fine-grain field gives gradients definition without temporal noise over a call.
    noise=np.random.default_rng(3101).normal(0,.45,(height,width)).astype(np.float32)
    base += noise[...,None]
    del xx,yy,cyan,blue,violet,mint,noise
    mask_lut=np.arange(256,dtype=np.float32)/255
    mask_lut=mask_lut*mask_lut*(3-2*mask_lut)
    tone=np.arange(256,dtype=np.float32)
    # Neutral midtones with slightly cooler shadows and a restrained shoulder.
    skin_luts=np.asarray([np.clip(tone*1.02-1.8,0,255),np.clip(tone*1.025-2.8,0,255),np.clip(tone*1.025-2.5,0,255)],dtype=np.uint8)
    def frame(n):
        src=cv2.imread(str(plates/f"{n:03}.png"),cv2.IMREAD_UNCHANGED)
        bgr=src[:,:,:3]
        mask=src[:,:,3]
        if high:
            source=high/f"{n:03}.jpg"
            deadline=time.monotonic()+source_timeout
            while not source.exists() and time.monotonic()<deadline:
                time.sleep(.4)
            enhanced=cv2.imread(str(source),cv2.IMREAD_COLOR)
            if enhanced is None: raise ValueError(f"Missing UHD source frame {n}")
            bgr=enhanced
            mask=cv2.resize(mask,(width,height),interpolation=cv2.INTER_LINEAR)
        alpha=mask_lut[mask][:,:,None]
        gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY).astype(np.float32)
        # Deviations from the source's charcoal backdrop retain cameras, scene axes and survey rays.
        signal=np.maximum(gray-37,0)*.85+np.minimum(gray-37,0)*.24
        background=base+signal[:,:,None]*np.asarray([1.04,1.00,.79],dtype=np.float32)
        performer=np.stack([cv2.LUT(bgr[:,:,i],skin_luts[i]) for i in range(3)],axis=2)
        return np.clip(background+(performer-background)*alpha,0,255).astype(np.uint8)
    args=["ffmpeg","-y","-v","error","-f","rawvideo","-pix_fmt","bgr24","-s",f"{width}x{height}","-r","60","-i","-","-an","-c:v","libx264","-threads","4","-preset","veryfast","-profile:v","high","-crf","18" if high else "17","-maxrate","19M" if high else "10M","-bufsize","20M" if high else "12M","-g","60","-pix_fmt","yuv420p","-movflags","+faststart",str(output)]
    output.parent.mkdir(parents=True,exist_ok=True)
    encoder=subprocess.Popen(args,stdin=subprocess.PIPE)
    cv2.setNumThreads(2)
    for position,n in enumerate(list(range(289))+list(range(287,0,-1))):
        image=frame(n)
        if position==0:cv2.imwrite(str(output.with_suffix(".webp")),image,[cv2.IMWRITE_WEBP_QUALITY,94])
        encoder.stdin.write(image.tobytes())
        if position%120==0:print("Optical grade",position,"of 576",flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError("Optical grade encoder failed")


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("plates",type=Path)
    parser.add_argument("output",type=Path)
    parser.add_argument("--enhanced",type=Path)
    parser.add_argument("--source-timeout",type=int,default=0,help="Wait for frames from an upstream image processor, in seconds")
    opt=parser.parse_args()
    grade(opt.plates,opt.output,opt.enhanced,opt.source_timeout)


