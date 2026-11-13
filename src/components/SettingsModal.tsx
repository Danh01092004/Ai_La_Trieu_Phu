import { Modal } from '@/components/ui/Modal'
import { Toggle } from '@/components/ui/Toggle'
import { VolumeSlider } from '@/components/ui/VolumeSlider'
import { ActionButton } from '@/components/ui/ActionButton'
import { useSettings } from '@/state/SettingsContext'
import { useFullscreen } from '@/hooks/useFullscreen'

interface Props {
  open: boolean
  onClose: () => void
}

/** Lobby settings: music, sfx, volume and fullscreen. */
export function SettingsModal({ open, onClose }: Props) {
  const { settings, toggleMusic, toggleSfx, setVolume } = useSettings()
  const { isFullscreen, toggle: toggleFullscreen, supported: fullscreenSupported } = useFullscreen()

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-md p-7" ariaLabel="Cài đặt">
      <h2 className="mb-6 text-center font-display text-3xl tracking-wider text-gold-300 text-glow-gold">
        CÀI ĐẶT
      </h2>

      <div className="flex flex-col gap-3">
        <Toggle checked={settings.music} onChange={toggleMusic} label="Nhạc nền" icon="🎵" />
        <Toggle checked={settings.sfx} onChange={toggleSfx} label="Hiệu ứng âm thanh" icon="🔊" />
        <VolumeSlider label="Âm lượng" icon="🎚️" value={settings.volume} onChange={setVolume} />

        {fullscreenSupported && (
          <Toggle
            checked={isFullscreen}
            onChange={toggleFullscreen}
            label="Toàn màn hình"
            icon="⛶"
          />
        )}
      </div>

      <ActionButton
        variant="outlineGold"
        fullWidth
        onClick={onClose}
        className="mt-6 py-3 tracking-widest"
      >
        ĐÓNG
      </ActionButton>
    </Modal>
  )
}
