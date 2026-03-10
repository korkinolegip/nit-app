import { Composition, registerRoot } from 'remotion'
import { NitDemo } from './NitDemo'
import { NitGif } from './NitGif'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="NitDemo"
        component={NitDemo}
        durationInFrames={870}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="NitGif"
        component={NitGif}
        durationInFrames={90}
        fps={15}
        width={960}
        height={540}
      />
    </>
  )
}

registerRoot(RemotionRoot)
