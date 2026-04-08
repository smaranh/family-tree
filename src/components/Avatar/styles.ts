import styled from '@emotion/styled';

export const Avatar = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid #c8ae8a;
  flex-shrink: 0;
  background: #e8d9c4;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`

export const AvatarInitials = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #8a6848;
  letter-spacing: -0.5px;
  user-select: none;
  font-family: 'Georgia', serif;
`
