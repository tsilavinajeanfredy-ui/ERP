import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Alert, TextInput, Image, Modal, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, Badge, AnimatedPage, FormModal, FormInput, FormSelect, SectionTitle, DataTable, StepperRow, Divider, ExportOverlay, PaginationControls } from '../components/Ui';
import { useFnc, useLots, useUsers, useUserProfile, useMutation, usePermissions, useNotification, useRecordAuditLogs, confirmAction } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { Fnc } from '../lib/database.types';
import { generatePdf, getPdfTemplate } from '../lib/pdf';

// Import platform-specific : Metro charge automatiquement
//   SignaturePad.web.tsx   → sur web/Vercel (SignatureWeb — canvas HTML5, zéro dépendance native)
//   SignaturePad.native.tsx → sur iOS/Android (react-native-signature-canvas)
// Cette approche évite tout require() synchrone évalué au bundling.
import SignaturePad from '../components/SignaturePad';

const FNC_STATUS_MAP: Record<string, { label: string; color: string }> = {
    OUVERTE: { label: 'Ouverte', color: C.err },
    EN_COURS: { label: 'En cours', color: C.info },
    A_VALIDER: { label: 'À Valider', color: C.gold },
    CLOTUREE: { label: 'Clôturée', color: C.ok },
};

/** Mapping pour transformer les champs BDD en libellés lisibles dans l'audit */
const FIELD_LABELS: Record<string, string> = {
    'd1_team': 'D1: Équipe',
    'description': 'D2: Problème',
    'd3_containment': 'D3: Actions Immédiates',
    'd4_root_cause': 'D4: Causes Racines',
    'd5_planned_actions': 'D5: Plan d\'Actions',
    'd6_implemented_actions': 'D6: Vérification',
    'd7_preventive_actions': 'D7: Prévention',
    'd8_closure_notes': 'D8: Clôture',
    'd8_signature': 'Signature Finale',
    'status': 'Statut Global',
    'assigned_to': 'Assignation'
};

const FNC_SEVERITY_MAP: Record<string, { label: string; color: string }> = {
    CRITIQUE: { label: 'Critique', color: C.err },
    MAJEURE: { label: 'Majeure', color: C.gold },
    MINEURE: { label: 'Mineure', color: C.info },
};

const STEPS_8D = [
    'D1: Équipe',
    'D2: Problème',
    'D3: Actions Immédiates',
    'D4: Causes Racines',
    'D5: Plan d\'Actions',
    'D6: Vérification',
    'D7: Prévention',
    'D8: Clôture'
];

export function FncScreen() {
    const { width } = useWindowDimensions();
    const isMobile = width < 992;
    const [page, setPage] = React.useState(0);
    const limit = 20;

    const { t } = useTranslation();
  const { data: fncs = [], count: fncsCount, isPending: loadingFncs } = useFnc(page, limit); // Fetch FNCs
    const { data: lots = [] } = useLots(0, 100); // To select associated lot
    const { profile } = useUserProfile();

    const { canPerformAction, role } = usePermissions();
    const { searchQuery } = useSearch();

    const [activeDStep, setActiveDStep] = React.useState(0);
    const [dContent, setDContent] = React.useState('');
    const [isSavingD, setIsSavingD] = React.useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
    const [signature, setSignature] = React.useState<string | null>(null); // Base64 string of the signature
    const [isSigModalVisible, setIsSigModalVisible] = React.useState(false);
    const notify = useNotification(); // Use the renamed hook

    const [selId, setSelId] = React.useState<string | null>(null);
    const [modalVisible, setModalVisible] = React.useState(false);
    const [compareModalVisible, setCompareModalVisible] = React.useState(false);
    const [assignModalVisible, setAssignModalVisible] = React.useState(false);
    const [assignUserId, setAssignUserId] = React.useState<string>('');
    const { data: users = [] } = useUsers(0, 100);
    const [selectedAuditLogForCompare, setSelectedAuditLogForCompare] = React.useState<any | null>(null);

    const { data: history = [] } = useRecordAuditLogs('fnc', selId || '');

    const [formData, setFormData] = React.useState<any>({});
    const [isEditing, setIsEditing] = React.useState(false);

    const mutation = useMutation('fnc', () => setModalVisible(false));
    const saving = mutation.isPending;

    // filteredFncs défini AVANT le early return pour éviter TS2304
    const selectedFnc = fncs.find((f: Fnc) => f.id === selId);

    const filteredFncs = fncs.filter((f: Fnc) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            f.code?.toLowerCase().includes(q) ||
            f.description?.toLowerCase().includes(q) ||
            f.status?.toLowerCase().includes(q)
        );
    });

    // Reset page when search changes
    React.useEffect(() => {
        setPage(0);
    }, [searchQuery]);

    if (loadingFncs) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={C.green} />
            </View>
        );
    }

    const renderDiffItem = (key: string, oldVal: any, newVal: any) => (
        <View key={key} style={s.diffItem}>
            <Text style={s.diffKey}>{FIELD_LABELS[key] || key}</Text>
            <Text style={s.diffOld}>{String(oldVal ?? '—')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color="#ADB5BD" />
            <Text style={s.diffNew}>{String(newVal ?? '—')}</Text>
        </View>
    );

    const handleAddFnc = () => {
        const year = new Date().getFullYear();
        const count = fncs.length + 1;
        const generatedCode = `FNC-${year}-${count.toString().padStart(4, '0')}`;

        setIsEditing(false);
        setFormData({
            code: generatedCode,
            status: 'OUVERTE',
            severity: 'MAJEURE',
            created_at: new Date().toISOString(),
            created_by: profile?.full_name || 'Système', // Use full_name for display
        });
        setModalVisible(true);
    };

    const handleSaveFnc = () => {
        if (!formData.code || !formData.lot_id || !formData.description) {
            Alert.alert("Champs manquants", "Veuillez renseigner le code, le lot et la description.");
            return;
        }
        if (isEditing && formData.id) {
            mutation.mutate({ id: formData.id, values: formData, type: 'UPDATE' });
        } else {
            mutation.mutate({ values: formData, type: 'INSERT' });
        }
        setIsEditing(false);
    };

    const handleEditFnc = (item: any) => {
        setIsEditing(true);
        setFormData({
            id: item.id,
            code: item.code,
            lot_id: item.lot_id,
            lot_code: item.lot_code,
            article_name: item.article_name,
            severity: item.severity,
            description: item.description,
            assigned_to: item.assigned_to,
        });
        setModalVisible(true);
    };

    const handleDeleteFnc = (fncId: string) => {
        confirmAction(
            'Supprimer la FNC',
            'Cette opération est irréversible. Confirmez la suppression de la FNC.',
            () => {
                mutation.mutate({ id: fncId, type: 'DELETE' }, { onSuccess: () => { setSelId(null); } });
            }
        );
    };

    const handleCloseFnc = (fncId: string) => {
        mutation.mutate({
            id: fncId,
            values: { status: 'CLOTUREE', closed_at: new Date().toISOString(), closed_by: profile?.full_name || 'Système' },
            type: 'UPDATE'
        });
        setSelId(null); // Close detail view after action
    };

    const handleSaveDStep = async () => {
        if (!selectedFnc || selectedFnc.status === 'CLOTUREE') return;
        setIsSavingD(true);

        const fieldMap: Record<number, keyof Fnc> = {
            0: 'd1_team',
            1: 'description',
            2: 'd3_containment',
            3: 'd4_root_cause',
            4: 'd5_planned_actions',
            5: 'd6_implemented_actions',
            6: 'd7_preventive_actions',
            7: 'd8_closure_notes',
        };

        const field = fieldMap[activeDStep];

        mutation.mutate({
            id: selectedFnc.id,
            values: {
                [field]: dContent,
                status: activeDStep === 7 ? 'A_VALIDER' : 'EN_COURS',
                ...(activeDStep === 7 ? { d8_signature: signature } : {})
            },
            type: 'UPDATE'
        }, {
            onSuccess: () => {
                setIsSavingD(false);

                // Automatisation CCTP : Notification du Responsable Qualité si l'analyse 8D est complète
                if (activeDStep === 7) {
                    notify.mutate({
                        to_role: 'RQ',
                        subject: `Analyse 8D prête pour clôture : ${selectedFnc?.code}`,
                        message: `Le rapport 8D pour la FNC ${selectedFnc?.code} concernant le lot ${selectedFnc?.lot_code} (${selectedFnc?.article_name}) a été complété techniquement et attend votre validation finale.`,
                        metadata: { fnc_id: selectedFnc?.id },
                        type: 'internal',
                        category: 'QUALITY', // Catégorie métier pour le filtrage
                    });

                    // NEW: Notification push pour la Direction (DPI)
                    notify.mutate({
                        to_role: 'DPI',
                        subject: `FNC ${selectedFnc?.code} en attente d'approbation`,
                        message: `Une FNC (${selectedFnc?.code}) est prête pour votre approbation finale.`,
                        metadata: { fnc_id: selectedFnc?.id },
                        type: 'internal', // Notification interne également
                    });
                }

                if (activeDStep < 7) setActiveDStep(activeDStep + 1);
            }
        });
    };

    React.useEffect(() => {
        if (selectedFnc) {
            const fieldMap: Record<number, any> = { 0: selectedFnc.d1_team, 1: selectedFnc.description, 2: selectedFnc.d3_containment, 3: selectedFnc.d4_root_cause, 4: selectedFnc.d5_planned_actions, 5: selectedFnc.d6_implemented_actions, 6: selectedFnc.d7_preventive_actions, 7: selectedFnc.d8_closure_notes };
            setDContent(fieldMap[activeDStep] || '');
            setSignature(selectedFnc.d8_signature || null);
        }
    }, [activeDStep, selectedFnc]);

    const handleReopenFnc = (fncId: string) => {
        Alert.alert(
            "Réouverture FNC",
            "Êtes-vous sûr de vouloir réouvrir cette FNC ? Les verrous de saisie seront levés.",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Réouvrir",
                    onPress: () => {
                        mutation.mutate({
                            id: fncId,
                            values: { status: 'EN_COURS', closed_at: null, closed_by: null },
                            type: 'UPDATE'
                        });
                    }
                }
            ]
        );
    };

    const handleOpenAssign = () => {
        setAssignUserId(selectedFnc?.assigned_to || '');
        setAssignModalVisible(true);
    };

    const handleConfirmAssign = () => {
        if (!selectedFnc || !assignUserId) {
            Alert.alert('Champ requis', 'Veuillez sélectionner un responsable.');
            return;
        }
        const assignedUser = users.find((u: any) => u.id === assignUserId);
        mutation.mutate(
            { id: selectedFnc.id, values: { assigned_to: assignedUser?.full_name || assignUserId }, type: 'UPDATE' },
            {
                onSuccess: () => {
                    setAssignModalVisible(false);
                    // Notify the assignee
                    notify.mutate({
                        to_role: (assignedUser?.role || 'RQ') as any,
                        subject: `FNC ${selectedFnc.code} — Assignation`,
                        message: `La FNC ${selectedFnc.code} vous a été assignée pour traitement.`,
                        type: 'internal',
                        category: 'QUALITY',
                    });

                    // Also notify RH and Management (ADMIN) to keep them informed
                    notify.mutate({
                        to_role: 'RH' as any,
                        subject: `FNC ${selectedFnc.code} — Nouvelle assignation`,
                        message: `La FNC ${selectedFnc.code} a été assignée à ${assignedUser?.full_name || assignedUser?.id || 'un responsable'}.`,
                        type: 'internal',
                        category: 'QUALITY',
                        metadata: { fnc_id: selectedFnc.id }
                    });
                    notify.mutate({
                        to_role: 'ADMIN' as any,
                        subject: `FNC ${selectedFnc.code} — Assignation`,
                        message: `La FNC ${selectedFnc.code} a été assignée à ${assignedUser?.full_name || assignedUser?.id || 'un responsable'}.`,
                        type: 'internal',
                        category: 'QUALITY',
                        metadata: { fnc_id: selectedFnc.id }
                    });
                }
            }
        );
    };

    const handleSignatureOK = (img: string) => {
        setSignature(img);
        setIsSigModalVisible(false);
    };

    const generate8DPdf = async () => {
        if (!selectedFnc) return;
        setIsGeneratingPdf(true);

        try {
            const signatureImg = signature ? `<img src="${signature}" style="max-height: 80px;" />` : '<i>Non signé</i>';
            const htmlContent = getPdfTemplate(
                `RAPPORT D'ANALYSE 8D - ${selectedFnc.code}`,
                `
                <div class="summary-card">
                  <strong>ARTICLE :</strong> ${selectedFnc.article_name || 'N/A'}<br />
                  <strong>N° LOT :</strong> ${selectedFnc.lot_code || 'N/A'}<br />
                  <strong>SÉVÉRITÉ :</strong> ${selectedFnc.severity || 'N/A'}<br />
                  <strong>DATE OUVERTURE :</strong> ${new Date(selectedFnc.created_at).toLocaleDateString('fr-FR')}<br />
                  <strong>STATUT ACTUEL :</strong> ${selectedFnc.status || 'N/A'}<br />
                  <strong>RESPONSABLE :</strong> ${selectedFnc.assigned_to || 'N/A'}
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D1 : CONSTITUTION DE L'ÉQUIPE</h3>
                  <p>${selectedFnc.d1_team || 'Information non renseignée'}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D2 : DESCRIPTION DU PROBLÈME</h3>
                  <p>${selectedFnc.description}</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D3 : ACTIONS DE CONFINEMENT (IMMÉDIATES)</h3>
                  <p>${selectedFnc.d3_containment || 'N/A'}</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D4 : ANALYSE DES CAUSES RACINES</h3>
                  <p>${selectedFnc.d4_root_cause || 'N/A'}</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D5 : ACTIONS CORRECTIVES PLANIFIÉES</h3>
                  <p>${selectedFnc.d5_planned_actions || 'N/A'}</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D6 : ACTIONS IMPLÉMENTÉES ET VÉRIFIÉES</h3>
                  <p>${selectedFnc.d6_implemented_actions || 'N/A'}</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D7 : ACTIONS PRÉVENTIVES (ÉVITER LA RÉCIDIVE)</h3>
                  <p>${selectedFnc.d7_preventive_actions || 'N/A'}</p>
                </div>

                <div style="margin-bottom: 40px;">
                  <h3 style="border-bottom: 1px solid #E9ECEF; padding-bottom: 5px;">D8 : CLÔTURE ET COMMENTAIRES FINAUX</h3>
                  <p>${selectedFnc.d8_closure_notes || 'Analyse en cours...'}</p>
                </div>

                <table style="width: 100%; border: none;">
                  <tr>
                    <td style="border: none; text-align: right;">
                      <strong>Visa Qualité :</strong><br /><br />
                      ${signatureImg}
                    </td>
                  </tr>
                </table>
                `
            );

            await generatePdf(htmlContent, `Rapport_8D_${selectedFnc.code}.pdf`);
        } catch (error) {
            console.error(error);
            Alert.alert('Erreur', 'La génération du PDF a échoué.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const openFncs = fncs.filter(f => f.status === 'OUVERTE').length;
    const inProgressFncs = fncs.filter(f => f.status === 'EN_COURS' || f.status === 'A_VALIDER').length;
    const closedFncs = fncs.filter(f => f.status === 'CLOTUREE').length;

    return (
        <AnimatedPage>
            {isGeneratingPdf && <ExportOverlay visible={true} progress={0.5} title="Préparation du rapport 8D..." />}
            <ScrollView style={s.container} contentContainerStyle={s.content}>
                {/* Header */}
                <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
                    <View>
                        <Text style={s.title}>{t('fnc_title')}</Text>
                        <Text style={s.subTitle}>{t('fnc_sub')}</Text>
                    </View>
                    <View style={s.actions}>
                        {canPerformAction('create_fnc') && <ActionButton label="Nouvelle FNC" icon="plus" variant="primary" onPress={handleAddFnc} />}
                    </View>
                </View>

                {/* KPIs */}
                <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
                    <KpiCard label="FNC Ouvertes" value={String(openFncs)} sub="À traiter" color={C.err} />
                    <KpiCard label="FNC En cours" value={String(inProgressFncs)} sub="Actions en cours" color={C.info} />
                    <KpiCard label="FNC Clôturées" value={String(closedFncs)} sub="Ce mois" color={C.ok} />
                </View>

                <View style={{ height: 24 }} />

                <SectionTitle>LISTE DES NON-CONFORMITÉS</SectionTitle>

                <View style={s.tableContainer}>
                    {filteredFncs.length === 0 ? (
                        <View style={s.emptyState}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#E9ECEF" />
                            <Text style={s.emptyText}>{t('fnc_no_results')}</Text>
                        </View>
                    ) : (
                        <DataTable
                            data={filteredFncs}
                            columns={[
                                { key: 'code', label: 'Code', flex: 0.8, render: (item: any, idx?: number) => (
                                    <Text style={s.tableCellText}>{(typeof idx === 'number' ? `${idx + 1} · ` : '')}{item.code}</Text>
                                ) },
                                { key: 'lot_code', label: 'Lot', flex: 1 },
                                { key: 'article_name', label: 'Article', flex: 1.5 },
                                {
                                    key: 'description', label: 'Description', flex: 2, render: (item: any) => (
                                        <Text style={s.tableCellText} numberOfLines={1}>{item.description}</Text>
                                    )
                                },
                                {
                                    key: 'severity', label: 'Sévérité', flex: 0.8, render: (item: any) => (
                                        <Badge label={FNC_SEVERITY_MAP[item.severity]?.label || item.severity} color={FNC_SEVERITY_MAP[item.severity]?.color || C.textMuted} />
                                    )
                                },
                                {
                                    key: 'status', label: 'Statut', flex: 0.8, render: (item: any) => (
                                        <Badge label={FNC_STATUS_MAP[item.status]?.label || item.status} color={FNC_STATUS_MAP[item.status]?.color || C.textMuted} />
                                    )
                                },
                                {
                                    key: 'supplier_name', label: 'Fournisseur', flex: 1, render: (item: any) => (
                                        <Text style={s.tableCellText}>{item.supplier_name || '—'}</Text>
                                    )
                                },
                                {
                                    key: 'created_at', label: 'Date', flex: 1, render: (item: any) => (
                                        <Text style={s.tableCellText}>{new Date(item.created_at).toLocaleDateString()}</Text>
                                    )
                                },
                                {
                                    key: 'actions', label: '', flex: 0.8, render: (item: any) => (
                                        role === 'ADMIN' ? (
                                            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                                                <ActionButton label="" icon="pencil" variant="secondary" onPress={() => handleEditFnc(item)} />
                                                <ActionButton label="" icon="delete" variant="secondary" onPress={() => handleDeleteFnc(item.id)} />
                                            </View>
                                        ) : null
                                    )
                                },
                            ]}
                            onRowPress={(item) => setSelId(item.id)}
                        />
                    )}

                    <PaginationControls
                        currentPage={page}
                        totalItems={fncsCount}
                        limit={limit}
                        onPageChange={(p) => setPage(p)}
                        loading={loadingFncs}
                    />
                </View>
            </ScrollView>

            {/* Detail Modal for FNC */}
            <FormModal
                visible={!!selectedFnc}
                title={`Détails FNC ${selectedFnc?.code || ''}`}
                onClose={() => setSelId(null)}
                onSave={() => setSelId(null)} // No direct save for details, just close
                hideSaveButton={true} // Hide the save button for detail view
            >
                {selectedFnc && (
                    <View>
                        <View style={s.detailSection}>
                            <SectionTitle>INFORMATIONS GÉNÉRALES</SectionTitle>
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_code')}:</Text><Text style={s.detailValue}>{selectedFnc.code}</Text></View>
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('status')}:</Text><Badge label={FNC_STATUS_MAP[selectedFnc.status]?.label || selectedFnc.status} color={FNC_STATUS_MAP[selectedFnc.status]?.color || C.textMuted} /></View>
                            {selectedFnc.supplier_name && <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_supplier')}:</Text><Text style={s.detailValue}>{selectedFnc.supplier_name}</Text></View>}
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('severity')}:</Text><Badge label={FNC_SEVERITY_MAP[selectedFnc.severity]?.label || selectedFnc.severity} color={FNC_SEVERITY_MAP[selectedFnc.severity]?.color || C.textMuted} /></View>
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_date_created')}:</Text><Text style={s.detailValue}>{new Date(selectedFnc.created_at).toLocaleDateString()}</Text></View>
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_created_by')}:</Text><Text style={s.detailValue}>{selectedFnc.created_by || 'Système'}</Text></View>
                            {selectedFnc.assigned_to && <View style={s.detailRow}><Text style={s.detailLabel}>{t('assigned_to')}:</Text><Text style={s.detailValue}>{selectedFnc.assigned_to}</Text></View>}
                            {selectedFnc.closed_at && <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_closed_at')}:</Text><Text style={s.detailValue}>{new Date(selectedFnc.closed_at).toLocaleDateString()}</Text></View>}
                        </View>

                        <Divider />

                        <View style={s.detailSection}>
                            <SectionTitle>RAPPORT DE RÉSOLUTION 8D</SectionTitle>
                            <View style={{ marginVertical: 16 }}>
                                <StepperRow steps={STEPS_8D} current={activeDStep} />
                            </View>

                            <View style={s.dStepContainer}>
                                <Text style={s.dStepTitle}>{STEPS_8D[activeDStep]}</Text>
                                <TextInput
                                    style={[s.dStepInput, (selectedFnc.status === 'CLOTUREE' || !canPerformAction('create_fnc')) && s.dStepInputLocked]}
                                    multiline
                                    value={dContent ?? ''}
                                    onChangeText={setDContent}
                                    placeholder={selectedFnc.status === 'CLOTUREE' ? '' : !canPerformAction('create_fnc') ? 'Lecture seule' : `Saisir les informations pour ${STEPS_8D[activeDStep]}...`}
                                    editable={selectedFnc.status !== 'CLOTUREE' && canPerformAction('create_fnc')}
                                />
                                {activeDStep === 7 && (
                                    <View style={{ marginTop: 16 }}>
                                        <Text style={s.dStepTitle}>SIGNATURE ÉLECTRONIQUE</Text>
                                        <TouchableOpacity
                                            style={s.signatureBox}
                                            onPress={() => setIsSigModalVisible(true)}
                                            disabled={selectedFnc.status === 'CLOTUREE' || !canPerformAction('create_fnc')}
                                        >
                                            {signature ? (
                                                <Image source={{ uri: signature }} style={s.signatureImage} resizeMode="contain" />
                                            ) : (
                                                <View style={s.signaturePlaceholder}>
                                                    <MaterialCommunityIcons name="pencil-lock-outline" size={32} color="#ADB5BD" />
                                                    <Text style={s.signaturePlaceholderText}>{t('click_to_sign')}</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {selectedFnc.status !== 'CLOTUREE' && canPerformAction('create_fnc') && (
                                    <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                                        <ActionButton
                                            label={isSavingD ? "Enregistrement..." : "Valider cette étape"}
                                            variant="primary"
                                            onPress={handleSaveDStep}
                                            disabled={isSavingD}
                                        />
                                    </View>
                                )}

                            </View>
                        </View>

                        <Divider />

                        <View style={s.detailSection}>
                            <SectionTitle>HISTORIQUE DES MODIFICATIONS 8D</SectionTitle>
                            <View style={s.historyList}>
                                {history.length === 0 ? (
                                    <Text style={s.noHistory}>{t('fnc_no_history')}</Text>
                                ) : (
                                    history.map((log: any) => (
                                        <View key={log.id} style={s.historyItem}>
                                            <View style={s.historyDot} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.historyUser}>{log.user?.full_name || 'Système'} <Text style={s.historyDate}>· {new Date(log.created_at).toLocaleString('fr-FR')}</Text></Text>
                                                <Text style={s.historyAction}>Mise à jour de : <Text style={{ fontWeight: '700' }}>{Object.keys(log.new_data || {}).map(k => FIELD_LABELS[k] || k).join(', ')}</Text></Text>
                                                {log.action === 'UPDATE' && log.old_data && (
                                                    <View style={{ marginTop: 8 }}>
                                                        <ActionButton
                                                            label="Comparer les versions"
                                                            icon="compare-horizontal"
                                                            variant="secondary"
                                                            onPress={() => {
                                                                setSelectedAuditLogForCompare(log);
                                                                setCompareModalVisible(true);
                                                            }}
                                                            disabled={!log.old_data || !log.new_data}
                                                        />
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        </View>

                        <View style={s.detailSection}>
                            <SectionTitle>LOT CONCERNÉ</SectionTitle>
                            <View style={s.detailRow}><Text style={s.detailLabel}>{t('fnc_lot_number')}:</Text><Text style={s.detailValue}>{selectedFnc.lot_code}</Text></View>
                            <View style={s.detailRow}><Text style={s.detailLabel}>Article :</Text><Text style={s.detailValue}>{selectedFnc.article_name}</Text></View>
                        </View>

                        <View style={{ marginBottom: 20 }}>
                            <ActionButton label="Exporter Rapport 8D (PDF)" icon="file-pdf-box" onPress={generate8DPdf} disabled={isGeneratingPdf} />
                        </View>

                        {selectedFnc.status === 'CLOTUREE' && role === 'ADMIN' && (
                            <View style={{ marginBottom: 20 }}>
                                <ActionButton
                                    label="Réouvrir la FNC (Admin)"
                                    icon="lock-open-outline"
                                    variant="secondary"
                                    onPress={() => handleReopenFnc(selectedFnc.id)}
                                    disabled={mutation.isPending}
                                />
                            </View>
                        )}

                        {selectedFnc.status === 'A_VALIDER' && activeDStep === 7 && (
                            <View style={s.detailActions}>
                                {canPerformAction('create_fnc') ? (
                                    <ActionButton
                                        label="Approuver & Clôturer la FNC"
                                        icon="check-circle-outline"
                                        variant="primary"
                                        onPress={() => handleCloseFnc(selectedFnc.id)}
                                        disabled={mutation.isPending}
                                    />
                                ) : (
                                    <View style={s.restrictedBox}>
                                        <MaterialCommunityIcons name="shield-lock" size={20} color="#6C757D" />
                                        <Text style={s.restrictedText}>En attente de validation par le Responsable Qualité (RQ) ou l'Admin.</Text>
                                    </View>
                                )}

                                {canPerformAction('assign_fnc') && (
                                    <ActionButton
                                        label="Assigner"
                                        icon="account-arrow-right-outline"
                                        onPress={handleOpenAssign}
                                        disabled={mutation.isPending}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                )}
            </FormModal>

            {/* Modal d'assignation FNC */}
            <FormModal
                visible={assignModalVisible}
                title={`Assigner FNC ${selectedFnc?.code || ''}`}
                onClose={() => setAssignModalVisible(false)}
                onSave={handleConfirmAssign}
                loading={mutation.isPending}
            >
                <Text style={{ fontSize: 13, color: '#6C757D', marginBottom: 12 }}>
                    Sélectionnez le responsable qui prendra en charge cette FNC. Une notification interne lui sera envoyée.
                </Text>
                <FormSelect
                    label="Responsable assigné *"
                    value={assignUserId ?? ''}
                    options={users
                        .filter((u: any) => u.active)
                        .map((u: any) => ({ label: `${u.full_name || u.email} (${u.role})`, value: u.id }))
                    }
                    onSelect={(v: string) => setAssignUserId(v)}
                    searchable
                />
                {assignUserId ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, backgroundColor: '#F0FFF4', borderRadius: 8, borderWidth: 1, borderColor: '#6EE7B7' }}>
                        <MaterialCommunityIcons name="account-check-outline" size={18} color={C.green} />
                        <Text style={{ fontSize: 13, color: C.green, fontWeight: '600' }}>
                            {users.find((u: any) => u.id === assignUserId)?.full_name || '—'}
                        </Text>
                    </View>
                ) : null}
            </FormModal>

            {/* Modal de signature manuscrite */}
            <Modal visible={isSigModalVisible} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>Signature du Rapport 8D</Text>
                        <TouchableOpacity onPress={() => setIsSigModalVisible(false)}>
                            <MaterialCommunityIcons name="close" size={24} color="#6C757D" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, padding: 20 }}>
                        <SignaturePad
                            onOK={handleSignatureOK}
                            onEmpty={() => {}}
                            descriptionText="Veuillez signer à l'intérieur du cadre"
                            clearText="Effacer"
                            confirmText="Confirmer la signature"
                            webStyle={`.m-signature-pad--footer {display: flex; gap: 20px;} 
                                       .button.save {background-color: ${C.green};} 
                                       .button.clear {background-color: #6C757D; color: #FFF;}`}
                            autoClear={false}
                        />
                    </View>
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#ADB5BD', textAlign: 'center' }}>
                            En signant ce document, vous validez l'implémentation des actions correctives
                            et la conformité du rapport 8D avec les standards GSI.
                        </Text>
                    </View>
                </SafeAreaView>
            </Modal>

            {/* Modal for New FNC */}
            <FormModal
                visible={modalVisible}
                title={isEditing ? `Modifier FNC ${formData.code || ''}` : "Nouvelle Fiche de Non-Conformité"}
                onClose={() => { setModalVisible(false); setIsEditing(false); }}
                onSave={handleSaveFnc}
                loading={saving}
            >
                <FormInput label="N° FNC" value={formData.code ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
                <FormSelect
                    label="Lot concerné"
                    value={formData.lot_id ?? ''}
                    options={(lots || []).map(l => ({ label: `${l.code} - ${l.article?.name || 'Sans nom'}`, value: l.id }))}
                    onSelect={v => {
                        const selectedLot = lots.find(l => l.id === v);
                        setFormData({ ...formData, lot_id: v, lot_code: selectedLot?.code, article_name: selectedLot?.article?.name });
                    }}
                />
                <FormSelect
                    label="Sévérité"
                    value={formData.severity ?? ''}
                    options={[
                        { label: 'Critique', value: 'CRITIQUE' },
                        { label: 'Majeure', value: 'MAJEURE' },
                        { label: 'Mineure', value: 'MINEURE' },
                    ]}
                    onSelect={v => setFormData({ ...formData, severity: v })}
                />
                <FormInput label="Description détaillée" value={formData.description ?? ''} onChangeText={val => setFormData({ ...formData, description: val })} multiline />
                <FormSelect
                    label="Assigné à"
                    value={formData.assigned_to ?? ''}
                    options={[
                        { label: 'Responsable Qualité (RQ)', value: 'RQ' },
                        { label: 'Responsable Production (RPROD)', value: 'RPROD' },
                        { label: 'Magasinier (MAGA)', value: 'MAGA' },
                    ]}
                    onSelect={v => setFormData({ ...formData, assigned_to: v })}
                />
            </FormModal>

            {/* Modal de comparaison des versions */}
            <FormModal
                visible={compareModalVisible}
                title="Comparaison des versions (Audit)"
                onClose={() => setCompareModalVisible(false)}
                onSave={() => setCompareModalVisible(false)}
                hideSaveButton={true}
            >
                {selectedAuditLogForCompare && (
                    <View>
                        <View style={s.modalMeta}>
                            <Text style={s.modalMetaText}>Table: <Text style={{ fontWeight: '700' }}>{selectedAuditLogForCompare.table_name}</Text></Text>
                            <Text style={s.modalMetaText}>ID Enregistrement: <Text style={{ fontWeight: '700' }}>{selectedAuditLogForCompare.record_id}</Text></Text>
                            <Text style={s.modalMetaText}>Modifié par: <Text style={{ fontWeight: '700' }}>{selectedAuditLogForCompare.user?.full_name || 'Système'}</Text></Text>
                            <Text style={s.modalMetaText}>Le: <Text style={{ fontWeight: '700' }}>{new Date(selectedAuditLogForCompare.created_at).toLocaleString('fr-FR')}</Text></Text>
                        </View>

                        <Text style={s.diffTitle}>CHANGEMENTS EFFECTUÉS</Text>
                        <View style={s.diffContainer}>
                            {Object.keys(selectedAuditLogForCompare.new_data || {}).map(key =>
                                renderDiffItem(key, selectedAuditLogForCompare.old_data[key], selectedAuditLogForCompare.new_data[key])
                            )}
                        </View>
                    </View>
                )}
            </FormModal>
        </AnimatedPage>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    content: { padding: 24 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
    subTitle: { fontSize: 13, color: '#6C757D', marginTop: 4 },
    actions: { flexDirection: 'row', gap: 12 },
    grid: { flexDirection: 'row', gap: 16 },
    tableContainer: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E9ECEF',
        overflow: 'hidden',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: { marginTop: 16, fontSize: 15, color: '#ADB5BD', fontWeight: '600' },
    tableCellText: { fontSize: 13, color: '#1A1A1A', fontWeight: '500' },
    detailSection: { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    detailLabel: { width: 140, fontSize: 13, color: '#6C757D' },
    detailValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
    descriptionText: { fontSize: 13, color: '#1A1A1A', lineHeight: 20 },
    detailActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    restrictedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8 },
    restrictedText: { fontSize: 13, color: '#6C757D', fontStyle: 'italic' },
    dStepContainer: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E9ECEF' },
    dStepTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 12, textTransform: 'uppercase' },
    dStepInput: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D9E0', padding: 12, minHeight: 120, fontSize: 14, textAlignVertical: 'top', color: '#1A1A1A' },
    dStepInputLocked: { backgroundColor: '#F1F3F5', color: '#6C757D' },
    signatureBox: { height: 120, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D9E0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
    signatureImage: { width: '100%', height: '100%' },
    signaturePlaceholder: { alignItems: 'center', gap: 8 },
    signaturePlaceholderText: { fontSize: 12, color: '#ADB5BD', fontWeight: '600' },
    historyList: { marginTop: 12, gap: 16 },
    historyItem: { flexDirection: 'row', gap: 12 },
    historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.info, marginTop: 6 },
    historyUser: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
    historyDate: { fontWeight: '400', color: '#ADB5BD', fontSize: 12 },
    historyAction: { fontSize: 12, color: '#6C757D', marginTop: 2 },
    noHistory: { fontSize: 13, color: '#ADB5BD', fontStyle: 'italic', textAlign: 'center', padding: 20 },
    // Styles pour la comparaison des versions (similaires à AuditScreen)
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F3F5', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
    modalMeta: { backgroundColor: '#F8F9FA', padding: 16, borderRadius: 8, marginBottom: 20 },
    modalMetaText: { fontSize: 12, color: '#6C757D', marginBottom: 4 },
    diffTitle: { fontSize: 11, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
    diffContainer: { borderTopWidth: 1, borderTopColor: '#F1F3F5' },
    diffItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F5', gap: 12 },
    diffKey: { flex: 1, fontSize: 12, fontWeight: '700', color: '#495057' },
    diffOld: { flex: 1.5, fontSize: 12, color: C.err, textDecorationLine: 'line-through' },
    diffNew: { flex: 1.5, fontSize: 12, color: C.ok, fontWeight: '600' },
});