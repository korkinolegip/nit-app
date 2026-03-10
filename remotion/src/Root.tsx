import { Composition, registerRoot } from 'remotion'
import { NitDemo } from './NitDemo'

export const RemotionRoot = () => {
  return (
    <Composition
      id="NitDemo"
      component={NitDemo}
      durationInFrames={870}
      fps={30}
      width={1080}
      height={1920}
    />
  )
}

registerRoot(RemotionRoot)
