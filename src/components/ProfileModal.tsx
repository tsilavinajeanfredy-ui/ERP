import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pickImage } from '../lib/filePicker';
import { FormModal, FormInput, C } from './Ui';
import { useMutation } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { User } from '../lib/database.types';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  profile: User | null;
}

export function ProfileModal({ visible, onClose, profile }: ProfileModalProps) {
  const [formData, setFormData] = React.useState<Partial<User>>({});
  const [newPassword, setNewPassword] = React.useState('');
  const mutation = useMutation('users', () => {
    Alert.alert("Succès", "Profil mis à jour !");
    onClose();
  });

  React.useEffect(() => {
    if (profile) {
      setFormData(profile);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile?.id || !supabase) return;

    if (formData.email && formData.email !== profile.email) {
      const { error } = await supabase.auth.updateUser({ email: formData.email });
      if (error) {
        Alert.alert("Erreur", "Impossible de modifier l'email: " + error.message);
        return;
      } else {
        Alert.alert("Email modifié", "Veuillez vérifier votre nouvelle adresse email pour confirmer le changement.");
      }
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        Alert.alert("Erreur", "Le mot de passe doit contenir au moins 6 caractères.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        Alert.alert("Erreur", "Impossible de modifier le mot de passe: " + error.message);
        return;
      }
    }

    mutation.mutate({ id: profile.id, values: formData, type: 'UPDATE' });
    setNewPassword('');
  };

  const handlePickImage = async () => {
    if (!supabase) return;
    try {
      const picked = await pickImage();
      if (!picked) return;

      const path = `avatars/${profile?.id}/${Date.now()}_${picked.name}`;

      // Sur web, picked.file est l'objet File natif ; sur mobile, on utilise l'URI
      let fileBody: any = picked.file;
      if (Platform.OS !== 'web') {
        fileBody = { uri: picked.uri, type: picked.mimeType || 'image/jpeg', name: picked.name };
      }

      const { error } = await supabase.storage.from('profils').upload(path, fileBody, { upsert: true });

      if (error) {
        Alert.alert("Erreur", "Impossible d'uploader la photo: " + error.message);
        return;
      }

      const { data: urlData } = supabase.storage.from('profils').getPublicUrl(path);
      setFormData({ ...formData, avatar_url: urlData.publicUrl });
    } catch (err: any) {
      Alert.alert("Erreur", err.message);
    }
  };

  return (
    <FormModal
      visible={visible}
      title="Mon Profil"
      onClose={onClose}
      onSave={handleSave}
      loading={mutation.isPending}
    >
      <View style={s.avatarContainer}>
        <View style={s.avatar}>
          {formData.avatar_url ? (
            <Image source={{ uri: formData.avatar_url }} style={s.avatarImage} />
          ) : (
            <Text style={s.avatarInitials}>{formData.full_name?.substring(0, 2).toUpperCase() || '??'}</Text>
          )}
        </View>
        <TouchableOpacity style={s.editAvatarBtn} onPress={handlePickImage}>
          <MaterialCommunityIcons name="camera-plus" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FormInput 
        label="Nom Complet" 
        value={formData.full_name || ''} 
        onChangeText={(t) => setFormData({ ...formData, full_name: t })} 
      />
      <FormInput 
        label="Email" 
        value={formData.email || ''} 
        onChangeText={(t) => setFormData({ ...formData, email: t })} 
        keyboardType="email-address"
        editable={true}
      />
      
      <View style={s.roleBox}>
        <MaterialCommunityIcons name="shield-account" size={20} color={C.green} />
        <View>
          <Text style={s.roleTitle}>Rôle Actuel</Text>
          <Text style={s.roleText}>{profile?.role}</Text>
        </View>
      </View>

      <Text style={s.securityHeader}>Sécurité</Text>
      <FormInput 
        label="Nouveau mot de passe" 
        value={newPassword} 
        onChangeText={setNewPassword} 
        secureTextEntry
        placeholder="Laissez vide pour conserver l'actuel"
      />
    </FormModal>
  );
}

const s = StyleSheet.create({
  avatarContainer: { alignItems: 'center', marginBottom: 24, position: 'relative' },
  avatar: { 
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.green, 
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden' 
  },
  avatarInitials: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  avatarImage: { width: '100%', height: '100%' },
  editAvatarBtn: {
    position: 'absolute', bottom: 0, right: '35%', backgroundColor: '#1A1A1A',
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF'
  },
  roleBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, 
    backgroundColor: '#F8F9FA', borderRadius: 8, marginTop: 8, marginBottom: 16
  },
  roleTitle: { fontSize: 11, color: '#6C757D', fontWeight: '700', textTransform: 'uppercase' },
  roleText: { fontSize: 14, color: '#1A1A1A', fontWeight: '800' },
  securityHeader: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginTop: 8, marginBottom: 12 },
  securityOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, 
    borderWidth: 1, borderColor: '#E9ECEF', borderRadius: 8
  },
  securityText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' }
});
