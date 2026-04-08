import styled from '@emotion/styled';

const CARD_W = 180;
const CARD_H = 100;

export const Card = styled.div<{ isSpouse: boolean; hasWarning: boolean }>`
  width: ${CARD_W}px;
  height: ${CARD_H}px;
  position: relative;
  border-radius: 6px;
  background: ${({ isSpouse }) =>
    isSpouse
      ? 'linear-gradient(160deg, #fdf6ee 0%, #f5ece0 100%)'
      : 'linear-gradient(160deg, #fefaf4 0%, #f7edd8 100%)'};
  border: 1px solid ${({ hasWarning }) =>
    hasWarning ? '#c8915a' : '#d6c4a8'};
  box-shadow: 0 2px 8px rgba(80,50,20,0.10), 0 1px 2px rgba(80,50,20,0.08);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  overflow: hidden;
  font-family: 'Georgia', 'Times New Roman', serif;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
  box-sizing: border-box;
`

export const TopStripe = styled.div<{ isSpouse: boolean }>`
  height: 4px;
  border-radius: 6px 6px 0 0;
  background: ${({ isSpouse }) =>
    isSpouse
      ? 'linear-gradient(90deg, #b8956a, #d4a574)'
      : 'linear-gradient(90deg, #7a5c3a, #a07850)'};
  flex-shrink: 0;
`

export const Body = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  flex: 1;
`

export const Info = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const Name = styled.div`
  font-size: 12.5px;
  font-weight: 700;
  color: #3d2b1a;
  letter-spacing: 0.1px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Dob = styled.div`
  font-size: 10.5px;
  color: #7a5c3a;
  letter-spacing: 0.4px;
  font-variant-numeric: tabular-nums;
`

export const MissingLabel = styled.div`
  font-size: 9.5px;
  color: #c8915a;
  letter-spacing: 0.3px;
  font-style: italic;
`

export const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px 5px;
  gap: 4px;
`

export const IconButton = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #9a7a5a;
  transition: color 0.15s, background 0.15s;
`

export const WarningDot = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c8915a;
  border: 1.5px solid #fdf6ee;
`
