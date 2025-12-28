import tienhockPng from './tienhock.png';

interface TienHockLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

const TienHockLogo: React.FC<TienHockLogoProps> = ({
  width = 240,
  height = 240,
  className = "",
}) => {
  return (
    <img
      src={tienhockPng}
      alt="Tien Hock"
      width={width}
      height={height}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
};

export default TienHockLogo;
