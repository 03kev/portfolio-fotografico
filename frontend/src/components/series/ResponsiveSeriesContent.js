import React from 'react';
import styled from 'styled-components';
import { resolveVersionedPhotoAssetUrl } from '../../utils/imageUrl';

const Flow = styled.div`
  display: flex;
  flex-direction: column;
  gap: clamp(2.75rem, 7vw, 5.5rem);
  width: 100%;
`;

const FlowBlock = styled.section`
  width: min(100%, var(--series-block-width, 100%));
  margin-left: min(var(--series-block-offset, 0%), calc(100% - var(--series-block-width, 100%)));
  min-width: 0;
  content-visibility: auto;
  contain-intrinsic-size: auto 480px;

  @media (max-width: 700px) {
    width: 100%;
    margin-left: 0;
  }
`;

const Narrative = styled.div`
  color: rgba(255, 255, 255, 0.76);
  font-size: ${props => props.$size || 'var(--font-size-base)'};
  font-weight: ${props => (props.$bold ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)')};
  font-style: ${props => (props.$italic ? 'italic' : 'normal')};
  text-decoration: ${props => (props.$underline ? 'underline' : 'none')};
  font-family: ${props => (
    props.$mono
      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      : (props.$font || 'inherit')
  )};
  line-height: 1.75;
  letter-spacing: 0.02em;
  text-align: ${props => props.$align || 'left'};
  text-align-last: ${props => props.$alignLast || 'auto'};
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  @media (max-width: 600px) {
    font-size: ${props => props.$mobileSize || props.$size || 'var(--font-size-base)'};
    text-align: ${props => (props.$justify ? 'left' : (props.$align || 'left'))};
    text-align-last: auto;
    line-height: 1.65;
  }
`;

const Figure = styled.figure`
  margin: 0;
  width: 100%;
`;

const ImageSurface = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`;

const ImageButton = styled.button`
  appearance: none;
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 5px;
  }
`;

const StaticImageSurface = styled.div`
  width: 100%;
`;

const Picture = styled.picture`
  display: block;
  width: 100%;
`;

const ResponsiveImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
  max-height: min(82svh, 960px);
  object-fit: contain;
  object-position: center;
  background: transparent;
  border-radius: clamp(12px, 2vw, 18px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.07),
    0 18px 42px rgba(0, 0, 0, 0.2);
`;

const Caption = styled.figcaption`
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.58);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-align: center;
  text-transform: uppercase;
`;

const PhotoGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: clamp(10px, 1.8vw, 18px);
  align-items: start;

  @media (max-width: 700px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    gap: 18px;
  }
`;

const GroupPhoto = styled.figure`
  grid-column: span ${props => props.$span || 6};
  min-width: 0;
  margin: 0;

  @media (max-width: 700px) {
    grid-column: span ${props => (props.$mobileWide ? 2 : 1)};
  }

  @media (max-width: 420px) {
    grid-column: 1 / -1;
  }
`;

const GroupImage = styled(ResponsiveImage)`
  max-height: 68svh;
`;

function getBlockFlowStyle(block) {
  const layout = block?.layout || {};
  const span = Math.max(1, Math.min(24, Number(layout.w) || 24));
  const minimum = block?.type === 'text' ? 55 : block?.type === 'photos' ? 100 : 45;
  const width = Math.min(100, Math.max(minimum, (span / 24) * 100));
  const requestedOffset = (Math.max(0, Number(layout.x) || 0) / 24) * 100;
  const offset = Math.max(0, Math.min(requestedOffset, 100 - width));

  return {
    '--series-block-width': `${width}%`,
    '--series-block-offset': `${offset}%`
  };
}

function getTextPresentation(block, textSizeMap, textFontMap) {
  const textAlign = block.textAlign || 'left';
  const justify = ['justify', 'justify-right', 'justify-center'].includes(textAlign);
  const align = justify ? 'justify' : textAlign;
  const alignLast = textAlign === 'justify-right'
    ? 'right'
    : textAlign === 'justify-center'
      ? 'center'
      : 'auto';
  const desktopSize = textSizeMap[block.textSize] || textSizeMap.base;
  const mobileSize = block.textSize === 'xl'
    ? 'clamp(1.25rem, 6vw, 1.75rem)'
    : block.textSize === 'lg'
      ? 'clamp(1.1rem, 5vw, 1.4rem)'
      : desktopSize;

  return {
    align,
    alignLast,
    justify,
    desktopSize,
    mobileSize,
    font: textFontMap[block.textFont] || textFontMap.inter
  };
}

function ResponsivePicture({ photo }) {
  const mobileSrc = photo?.mobileImage
    ? resolveVersionedPhotoAssetUrl(photo, 'mobileImage')
    : '';
  const fullSrc = resolveVersionedPhotoAssetUrl(photo, 'image');

  return (
    <Picture>
      {mobileSrc && <source media="(max-width: 1024px)" srcSet={mobileSrc} />}
      <ResponsiveImage
        src={fullSrc}
        alt={photo?.title || 'Fotografia'}
        loading="lazy"
        decoding="async"
        draggable="false"
      />
    </Picture>
  );
}

export default function ResponsiveSeriesContent({
  content = [],
  photos = [],
  onPhotoClick,
  textSizeMap,
  textFontMap
}) {
  const photosById = React.useMemo(
    () => new Map(photos.map((photo) => [String(photo.id), photo])),
    [photos]
  );
  const blocks = React.useMemo(
    () => [...content].sort((a, b) => {
      const yDelta = Number(a?.layout?.y || 0) - Number(b?.layout?.y || 0);
      if (yDelta !== 0) return yDelta;
      return Number(a?.layout?.x || 0) - Number(b?.layout?.x || 0);
    }),
    [content]
  );

  return (
    <Flow>
      {blocks.map((block) => {
        if (block.type === 'text') {
          const presentation = getTextPresentation(block, textSizeMap, textFontMap);
          return (
            <FlowBlock key={block.id} style={getBlockFlowStyle(block)}>
              <Narrative
                $align={presentation.align}
                $alignLast={presentation.alignLast}
                $justify={presentation.justify}
                $size={presentation.desktopSize}
                $mobileSize={presentation.mobileSize}
                $bold={Boolean(block.textBold)}
                $italic={Boolean(block.textItalic)}
                $underline={Boolean(block.textUnderline)}
                $mono={Boolean(block.textMono)}
                $font={presentation.font}
              >
                {block.content}
              </Narrative>
            </FlowBlock>
          );
        }

        if (block.type === 'photo') {
          const photo = photosById.get(String(block.content));
          if (!photo) return null;
          const canOpen = block.showLightbox !== false && typeof onPhotoClick === 'function';
          const image = <ResponsivePicture photo={photo} />;

          return (
            <FlowBlock key={block.id} style={getBlockFlowStyle(block)}>
              <Figure>
                <ImageSurface>
                  {canOpen ? (
                    <ImageButton
                      type="button"
                      onClick={() => onPhotoClick(photo)}
                      aria-label={photo.title ? `Apri ${photo.title}` : 'Apri fotografia'}
                    >
                      {image}
                    </ImageButton>
                  ) : (
                    <StaticImageSurface>{image}</StaticImageSurface>
                  )}
                </ImageSurface>
                {block.showTitle !== false && photo.title && <Caption>{photo.title}</Caption>}
              </Figure>
            </FlowBlock>
          );
        }

        if (block.type === 'photos') {
          const groupCols = Math.max(1, Number(block?.layout?.w) || 1);
          const groupItems = [...(block.content || [])].sort((a, b) => {
            const yDelta = Number(a?.layout?.y || 0) - Number(b?.layout?.y || 0);
            if (yDelta !== 0) return yDelta;
            return Number(a?.layout?.x || 0) - Number(b?.layout?.x || 0);
          });

          return (
            <FlowBlock key={block.id} style={getBlockFlowStyle(block)}>
              <PhotoGroup>
                {groupItems.map((item) => {
                  const photo = photosById.get(String(item.id));
                  if (!photo) return null;
                  const itemWidth = Math.max(1, Number(item?.layout?.w) || 1);
                  const span = Math.max(3, Math.min(12, Math.round((itemWidth / groupCols) * 12)));
                  const mobileWide = itemWidth / groupCols >= 0.55;

                  return (
                    <GroupPhoto key={item.id} $span={span} $mobileWide={mobileWide}>
                      <ImageButton
                        type="button"
                        onClick={() => onPhotoClick?.(photo)}
                        aria-label={photo.title ? `Apri ${photo.title}` : 'Apri fotografia'}
                      >
                        <Picture>
                          {photo.mobileImage && (
                            <source
                              media="(max-width: 1024px)"
                              srcSet={resolveVersionedPhotoAssetUrl(photo, 'mobileImage')}
                            />
                          )}
                          <GroupImage
                            src={resolveVersionedPhotoAssetUrl(photo, 'image')}
                            alt={photo.title || 'Fotografia'}
                            loading="lazy"
                            decoding="async"
                            draggable="false"
                          />
                        </Picture>
                      </ImageButton>
                    </GroupPhoto>
                  );
                })}
              </PhotoGroup>
            </FlowBlock>
          );
        }

        return null;
      })}
    </Flow>
  );
}
