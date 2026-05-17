import React, {useEffect, useState} from 'react';

import {applyMicDeviceChange, applyCamDeviceChange} from '../../conference/controller';
import {
    getPreferredMicId,
    setPreferredMicId,
    getPreferredCamId,
    setPreferredCamId,
    getMuteOnJoin,
    setMuteOnJoin,
} from '../../conference/livekit/devices';
import {ringtoneSettingKey} from '../../user_settings';
import {useT} from '../../util/i18n';

function readRingtone(): boolean {
    try {
        return window.localStorage.getItem(ringtoneSettingKey) !== 'false';
    } catch {
        return true;
    }
}

function writeRingtone(enabled: boolean): void {
    try {
        window.localStorage.setItem(ringtoneSettingKey, enabled ? 'true' : 'false');
    } catch {
        // quota / private mode
    }
}

interface DeviceOption {
    id: string;
    label: string;
}

export const OpenTalkSettingsSection: React.FC = () => {
    const t = useT();
    const [ringtone, setRingtone] = useState<boolean>(readRingtone);
    const [muteOnJoin, setMuteOnJoinState] = useState<boolean>(getMuteOnJoin);
    const [audioDevices, setAudioDevices] = useState<DeviceOption[]>([]);
    const [videoDevices, setVideoDevices] = useState<DeviceOption[]>([]);
    const [micId, setMicIdState] = useState<string>(() => getPreferredMicId() ?? '');
    const [camId, setCamIdState] = useState<string>(() => getPreferredCamId() ?? '');

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                // Request permission so browsers populate device labels.
                // Some browsers return empty labels until getUserMedia has been called once.
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
                    stream.getTracks().forEach((track) => track.stop());
                } catch {
                    /* user denied; fall through with whatever enumerateDevices returns */
                }
                const all = await navigator.mediaDevices.enumerateDevices();
                if (cancelled) {
                    return;
                }
                setAudioDevices(
                    all.
                        filter((d) => d.kind === 'audioinput').
                        map((d) => ({id: d.deviceId, label: d.label || d.deviceId})),
                );
                setVideoDevices(
                    all.
                        filter((d) => d.kind === 'videoinput').
                        map((d) => ({id: d.deviceId, label: d.label || d.deviceId})),
                );
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[opentalk] enumerateDevices failed:', e);
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        refresh();
        return () => {
            cancelled = true;
        };
    }, []);

    const onRingtoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.checked;
        setRingtone(next);
        writeRingtone(next);
    };

    const onMuteOnJoinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.checked;
        setMuteOnJoinState(next);
        setMuteOnJoin(next);
    };

    const onMicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        setMicIdState(v);
        setPreferredMicId(v);
        // If a meeting is live and the mic is on, restart the track so the
        // new device takes effect immediately without the user having to
        // toggle the mic off and back on.
        void applyMicDeviceChange();
    };

    const onCamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        setCamIdState(v);
        setPreferredCamId(v);
        void applyCamDeviceChange();
    };

    return (
        <div style={{padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 16}}>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                <input
                    type='checkbox'
                    checked={ringtone}
                    onChange={onRingtoneChange}
                />
                <span>{t({de: 'Klingelton bei eingehenden Anrufen abspielen', en: 'Play ringtone for incoming calls'})}</span>
            </label>

            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                <input
                    type='checkbox'
                    checked={muteOnJoin}
                    onChange={onMuteOnJoinChange}
                />
                <span>{t({de: 'Meetings stummgeschaltet beitreten', en: 'Join meetings muted'})}</span>
            </label>

            <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <span>{t({de: 'Mikrofon', en: 'Microphone'})}</span>
                <select
                    value={micId}
                    onChange={onMicChange}
                    style={{padding: '6px 8px', borderRadius: 4}}
                >
                    <option value=''>{t({de: 'Standard', en: 'Default'})}</option>
                    {audioDevices.map((d) => (
                        <option
                            key={d.id}
                            value={d.id}
                        >{d.label}</option>
                    ))}
                </select>
            </label>

            <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <span>{t({de: 'Kamera', en: 'Camera'})}</span>
                <select
                    value={camId}
                    onChange={onCamChange}
                    style={{padding: '6px 8px', borderRadius: 4}}
                >
                    <option value=''>{t({de: 'Standard', en: 'Default'})}</option>
                    {videoDevices.map((d) => (
                        <option
                            key={d.id}
                            value={d.id}
                        >{d.label}</option>
                    ))}
                </select>
            </label>
        </div>
    );
};
