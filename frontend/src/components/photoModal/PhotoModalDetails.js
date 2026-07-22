import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { motion } from 'framer-motion'
import { Check, Download, MapPin, Share2 } from 'lucide-react'
import { toAbsoluteSiteUrl } from '../../utils/siteUrl'

const HeaderIntro = styled.div`
    max-width: 100%;
    padding-right: 92px;
    margin-bottom: 6px;

    @media (max-width: 768px) {
        padding-right: 64px;
        margin-bottom: 2px;
    }
`

const DetailsContent = styled.div`
    width: 100%;
    max-width: ${({ $compactDesktop }) => ($compactDesktop ? '680px' : '100%')};
    margin: 0 auto;
`

const PhotoTitle = styled(motion.h2)`
    color: var(--color-white);
    font-size: clamp(2rem, 2vw + 1rem, 2.65rem);
    font-weight: var(--font-weight-bold);
    margin-bottom: 10px;
    line-height: 1.08;
    letter-spacing: -0.04em;

    @media (max-width: 768px) {
        font-size: 1.65rem;
        margin-bottom: 8px;
        line-height: 1.08;
    }
`

const PhotoLocation = styled(motion.p)`
    color: var(--color-accent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    margin-bottom: 16px;
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-normal);
    display: inline-flex;
    align-items: center;
    gap: 8px;

    &:hover {
        color: var(--color-white);
    }

    @media (max-width: 768px) {
        font-size: var(--font-size-base);
        margin-bottom: 12px;
    }
`

const PhotoDescription = styled(motion.p)`
    color: rgba(255, 255, 255, 0.72);
    font-size: 1rem;
    line-height: 1.72;
    margin-bottom: 20px;
    max-width: none;

    @media (max-width: 768px) {
        font-size: var(--font-size-sm);
        line-height: 1.6;
        margin-bottom: 14px;
    }
`

const MetadataSection = styled(motion.div)`
    margin-bottom: 20px;

    @media (max-width: 768px) {
        margin-bottom: 16px;
    }
`

const MetadataTitle = styled.h3`
    color: var(--color-white);
    font-size: 0.92rem;
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    @media (max-width: 768px) {
        font-size: 0.88rem;
        margin-bottom: 10px;
        padding-bottom: 8px;
    }
`

const MetadataGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-md);

    @media (max-width: 768px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }
`

const MetadataItem = styled.div`
    background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.03) 0%,
        rgba(255, 255, 255, 0.015) 100%
    );
    padding: 14px 15px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);

    &.wide {
        grid-column: 1 / -1;
    }

    .label {
        color: rgba(255, 255, 255, 0.44);
        font-size: 0.73rem;
        font-weight: var(--font-weight-medium);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 7px;
    }

    .value {
        color: var(--color-white);
        font-size: 1rem;
        font-weight: var(--font-weight-medium);
        line-height: 1.35;
    }
`

const TagsContainer = styled(motion.div)`
    margin-bottom: 20px;
`

const TagsGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);

    @media (max-width: 768px) {
        gap: 8px;
    }
`

const Tag = styled(motion.span)`
    background: rgba(214, 181, 102, 0.14);
    color: var(--color-accent);
    padding: 8px 14px;
    border-radius: var(--border-radius-full);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    border: 1px solid rgba(214, 181, 102, 0.18);
    transition: all var(--transition-normal);

    &:hover {
        transform: translateY(-2px);
        color: var(--color-white);
        background: rgba(214, 181, 102, 0.2);
        border-color: rgba(214, 181, 102, 0.26);
    }
`

const ActionButtons = styled(motion.div)`
    display: flex;
    gap: var(--spacing-md);
    margin-top: 18px;

    @media (max-width: 768px) {
        flex-direction: row;
        gap: 10px;
        margin-top: 16px;
    }
`

const ActionButton = styled(motion.button)`
    flex: 1 1 0;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
    padding: var(--spacing-md) var(--spacing-lg);
    background: rgba(255, 255, 255, 0.055);
    color: var(--color-white);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);
    backdrop-filter: blur(14px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);

    &:hover {
        background: rgba(255, 255, 255, 0.09);
        border-color: rgba(255, 255, 255, 0.14);
        transform: translateY(-2px);
    }

    &.primary {
        background: linear-gradient(
            135deg,
            rgba(214, 181, 102, 0.95) 0%,
            rgba(190, 156, 82, 0.94) 100%
        );
        border-color: rgba(214, 181, 102, 0.2);
        color: rgba(15, 14, 10, 0.95);

        &:hover {
            transform: translateY(-2px);
            background: linear-gradient(
                135deg,
                rgba(224, 191, 111, 0.98) 0%,
                rgba(200, 165, 88, 0.98) 100%
            );
            box-shadow: 0 14px 28px rgba(214, 181, 102, 0.22);
        }
    }

    @media (max-width: 768px) {
        padding: 14px 12px;
        font-size: 0.95rem;
        gap: 6px;
    }

    @media (max-width: 420px) {
        font-size: 0.88rem;
        padding: 13px 10px;

        svg {
            width: 15px;
            height: 15px;
        }
    }
`

const getAnimationProps = (withMotion, delay) => {
    if (!withMotion) {
        return {
            initial: false,
            animate: false,
            transition: undefined,
        }
    }

    return {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, delay },
    }
}

const getTagAnimationProps = (withMotion, delay) => {
    if (!withMotion) {
        return {
            initial: false,
            animate: false,
            transition: undefined,
        }
    }

    return {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.3, delay },
    }
}

const PhotoModalDetails = ({
    photo,
    canDownload,
    downloadSrc,
    galleryModalOpen,
    actions,
    handleLocationClick,
    handleTagClick,
    formatDate,
    formatResolution,
    withMotion = true,
    compactDesktop = false,
}) => {
    const [shareFeedback, setShareFeedback] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState(false)
    const sharePath = `/photo/${encodeURIComponent(String(photo.id))}`
    const shareUrl =
        typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}${sharePath}`
            : toAbsoluteSiteUrl(sharePath)

    useEffect(() => {
        setShareFeedback(false)
        setDownloadError(false)
    }, [photo.id])

    const handleShare = async () => {
        const shareData = {
            title: photo.title,
            text: photo.description || photo.title,
            url: shareUrl,
        }
        const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
            navigator.userAgent || ''
        )
        const hasTouchInput = Number(navigator.maxTouchPoints || 0) > 0
        const hasCoarsePointer = Boolean(
            window.matchMedia?.('(pointer: coarse)').matches
        )
        const useNativeMobileShare =
            typeof navigator.share === 'function' &&
            (mobileUserAgent || (hasTouchInput && hasCoarsePointer))

        if (useNativeMobileShare) {
            try {
                await navigator.share(shareData)
                return
            } catch (error) {
                if (error?.name === 'AbortError') return
            }
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl)
            } else {
                const input = document.createElement('textarea')
                input.value = shareUrl
                input.style.position = 'fixed'
                input.style.opacity = '0'
                document.body.appendChild(input)
                input.select()
                document.execCommand('copy')
                input.remove()
            }
            setShareFeedback(true)
            window.setTimeout(() => setShareFeedback(false), 1800)
        } catch {
            // Il bottone resta disponibile: alcuni contesti bloccano la clipboard senza permesso esplicito.
        }
    }

    const handleDownload = async () => {
        if (!canDownload || isDownloading) return
        if (galleryModalOpen) actions.closeGalleryModal()

        setIsDownloading(true)
        setDownloadError(false)
        try {
            const response = await fetch(downloadSrc, {
                credentials: 'include',
            })
            if (!response.ok)
                throw new Error(`Download non disponibile (${response.status})`)

            const blob = await response.blob()
            if (!blob.size) throw new Error('Il file scaricato è vuoto')

            const contentDisposition =
                response.headers.get('content-disposition') || ''
            const encodedFilename = contentDisposition.match(
                /filename\*=UTF-8''([^;]+)/i
            )?.[1]
            let filename = `photo-${photo.id}.webp`
            if (encodedFilename) {
                try {
                    filename = decodeURIComponent(encodedFilename)
                } catch {
                    // Mantiene il nome di fallback se l'header non è decodificabile.
                }
            }

            const objectUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = objectUrl
            link.download = filename
            link.target = '_self'
            link.rel = 'noopener'
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
        } catch (error) {
            console.error('Download foto fallito:', error)
            setDownloadError(true)
            window.setTimeout(() => setDownloadError(false), 2200)
        } finally {
            setIsDownloading(false)
        }
    }

    const hasTechnicalData = Boolean(
        photo.camera ||
        photo.lens ||
        photo.resolution ||
        photo.settings?.aperture ||
        photo.settings?.shutter ||
        photo.settings?.iso ||
        photo.settings?.focal ||
        photo.date
    )

    return (
        <DetailsContent $compactDesktop={compactDesktop}>
            <HeaderIntro>
                <PhotoTitle {...getAnimationProps(withMotion, 0.1)}>
                    {photo.title}
                </PhotoTitle>

                <PhotoLocation
                    {...getAnimationProps(withMotion, 0.2)}
                    onClick={handleLocationClick}
                >
                    <MapPin size={16} />
                    {photo.location}
                </PhotoLocation>
            </HeaderIntro>

            {photo.description && (
                <PhotoDescription {...getAnimationProps(withMotion, 0.3)}>
                    {photo.description}
                </PhotoDescription>
            )}

            {hasTechnicalData && (
                <MetadataSection {...getAnimationProps(withMotion, 0.4)}>
                    <MetadataTitle>Dati Tecnici</MetadataTitle>
                    <MetadataGrid>
                        {photo.camera && (
                            <MetadataItem className="wide">
                                <div className="label">Camera</div>
                                <div className="value">{photo.camera}</div>
                            </MetadataItem>
                        )}
                        {photo.lens && (
                            <MetadataItem className="wide">
                                <div className="label">Obiettivo</div>
                                <div className="value">{photo.lens}</div>
                            </MetadataItem>
                        )}
                        {photo.resolution && (
                            <MetadataItem className="wide">
                                <div className="label">Risoluzione</div>
                                <div className="value">
                                    {formatResolution(photo.resolution)}
                                </div>
                            </MetadataItem>
                        )}
                        {photo.settings?.aperture && (
                            <MetadataItem>
                                <div className="label">Apertura</div>
                                <div className="value">
                                    {photo.settings.aperture}
                                </div>
                            </MetadataItem>
                        )}
                        {photo.settings?.shutter && (
                            <MetadataItem>
                                <div className="label">Tempo</div>
                                <div className="value">
                                    {photo.settings.shutter}
                                </div>
                            </MetadataItem>
                        )}
                        {photo.settings?.iso && (
                            <MetadataItem>
                                <div className="label">ISO</div>
                                <div className="value">
                                    {photo.settings.iso}
                                </div>
                            </MetadataItem>
                        )}
                        {photo.settings?.focal && (
                            <MetadataItem>
                                <div className="label">Focale</div>
                                <div className="value">
                                    {photo.settings.focal}
                                </div>
                            </MetadataItem>
                        )}
                        {photo.date && (
                            <MetadataItem className="wide">
                                <div className="label">Data</div>
                                <div className="value">
                                    {formatDate(photo.date)}
                                </div>
                            </MetadataItem>
                        )}
                    </MetadataGrid>
                </MetadataSection>
            )}

            {photo.tags && photo.tags.length > 0 && (
                <TagsContainer {...getAnimationProps(withMotion, 0.5)}>
                    <MetadataTitle>Tag</MetadataTitle>
                    <TagsGrid>
                        {photo.tags.map((tag, index) => (
                            <Tag
                                key={tag}
                                onClick={() => handleTagClick(tag)}
                                {...getTagAnimationProps(
                                    withMotion,
                                    0.1 * index
                                )}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                {tag}
                            </Tag>
                        ))}
                    </TagsGrid>
                </TagsContainer>
            )}

            <ActionButtons {...getAnimationProps(withMotion, 0.6)}>
                <ActionButton
                    type="button"
                    className="primary"
                    disabled={!canDownload || isDownloading}
                    onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleDownload()
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <Download size={16} />
                    {isDownloading
                        ? 'Download…'
                        : downloadError
                          ? 'Non disponibile'
                          : 'Download'}
                </ActionButton>
                <ActionButton
                    type="button"
                    onClick={handleShare}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    {shareFeedback ? <Check size={16} /> : <Share2 size={16} />}
                    {shareFeedback ? 'Link copiato' : 'Condividi'}
                </ActionButton>
            </ActionButtons>
        </DetailsContent>
    )
}

export default PhotoModalDetails
