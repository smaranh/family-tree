import * as Styles from './styles';

export const Avatar = ({ name, image }: { name: string | null; image: string | null }) => {
    if (image) {
        return (
            <Styles.Avatar>
                <img src={image} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </Styles.Avatar>
        );
    }

    const initials = name
        ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
        : '?';

    return (
        <Styles.Avatar>
            <Styles.AvatarInitials>{initials}</Styles.AvatarInitials>
        </Styles.Avatar>
    );
}