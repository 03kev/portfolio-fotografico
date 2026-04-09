import React from 'react';
import styled from 'styled-components';

const MobileViewport = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  background: rgba(6, 8, 14, 0.96);
`;

const MobileCarousel = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const MobileSlide = styled.section`
  flex: 0 0 100%;
  min-width: 100%;
  min-height: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
`;

const MobileIndicatorBar = styled.div`
  display: flex;
  justify-content: center;
  padding: 14px 0 18px;
  margin-top: 2px;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 18, 0) 0%,
    rgba(10, 12, 18, 0.42) 100%
  );
`;

const MobileIndicatorPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(11, 13, 20, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(16px);
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
`;

const MobileIndicatorDot = styled.button`
  width: ${({ $active }) => ($active ? '18px' : '7px')};
  height: 7px;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.25)'};
  transition: width 0.22s ease, background 0.22s ease, opacity 0.22s ease;
  opacity: ${({ $active }) => ($active ? 1 : 0.9)};
  border: 0;
  padding: 0;
  cursor: pointer;
`;

const PhotoModalMobilePager = ({
  activeSlide,
  carouselRef,
  children,
  onScroll,
  onSelectSlide
}) => (
  <MobileViewport>
    <MobileCarousel ref={carouselRef} onScroll={onScroll}>
      {React.Children.map(children, (child, index) => (
        <MobileSlide aria-label={index === 0 ? 'Foto' : 'Dettagli'}>{child}</MobileSlide>
      ))}
    </MobileCarousel>
    <MobileIndicatorBar>
      <MobileIndicatorPill aria-hidden="true">
        <MobileIndicatorDot type="button" $active={activeSlide === 0} onClick={() => onSelectSlide?.(0)} />
        <MobileIndicatorDot type="button" $active={activeSlide === 1} onClick={() => onSelectSlide?.(1)} />
      </MobileIndicatorPill>
    </MobileIndicatorBar>
  </MobileViewport>
);

export default PhotoModalMobilePager;
