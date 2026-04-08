import { memo, useCallback, MouseEvent } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { PersonNodeData } from '../../utils/buildTree';
import { useToggleExpand, useGetChildren } from '../../store/familyStore';
import { Avatar } from '../Avatar';
import { FocusIcon } from '../FocusIcon';
import * as Styles from './styles';

export const PersonCard = ({ id, data }: NodeProps<PersonNodeData>) => {
    const toggleExpand = useToggleExpand();
    const getChildren = useGetChildren();

    const { person, isSpouse } = data;
    const { fitView } = useReactFlow();

    const hasWarning = !person.name || !person.dob;
    const hasChildren = getChildren(person.id).length > 0;

    const handleCardClick = useCallback(() => {
        if (!hasChildren) return;
        toggleExpand(person.id);
    }, [hasChildren, toggleExpand, person.id]);

    const handleFocusClick = useCallback(
        (e: MouseEvent) => {
            e.stopPropagation();
            fitView({ nodes: [{ id }], duration: 400, padding: 0.3 });
        },
        [fitView, id]
    );

    const formattedDob = person.dob
        ? new Date(person.dob).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        : null;

    return (
        <Styles.Card isSpouse={isSpouse} hasWarning={hasWarning}
            onClick={handleCardClick}
            title={hasChildren ? 'Click to expand/collapse' : undefined}
        >
            {/* React Flow connection handles — hidden visually */}
            <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

            {/* Coloured top stripe */}
            <Styles.TopStripe isSpouse={isSpouse} />

            {/* Warning dot */}
            {hasWarning && <Styles.WarningDot title="Missing name or date of birth" />}

            {/* Main body */}
            <Styles.Body>
                <Avatar name={person.name} image={person.image} />
                <Styles.Info>
                    {person.name ? (
                        <Styles.Name>{person.name}</Styles.Name>
                    ) : (
                        <Styles.MissingLabel>No name</Styles.MissingLabel>
                    )}
                    {formattedDob ? (
                        <Styles.Dob>{formattedDob}</Styles.Dob>
                    ) : (
                        <Styles.MissingLabel>No date of birth</Styles.MissingLabel>
                    )}
                </Styles.Info>
            </Styles.Body>

            {/* Footer: focus button */}
            <Styles.Footer>
                <Styles.IconButton
                    onClick={handleFocusClick}
                    title="Focus on this person's subtree"
                >
                    <FocusIcon />
                </Styles.IconButton>
            </Styles.Footer>
        </Styles.Card>
    );
}

export default memo(PersonCard);
