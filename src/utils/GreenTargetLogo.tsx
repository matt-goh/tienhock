import greenTargetPng from './GreenTargetLogo.png';

interface GreenTargetLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

const GreenTargetLogo: React.FC<GreenTargetLogoProps> = ({
  width = 240,
  height = 240,
  className = "",
}) => {
  return (
    <img
      src={greenTargetPng}
      alt="Green Target"
      width={width}
      height={height}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
};

export default GreenTargetLogo;
